// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "./interfaces/ISemaphore.sol";
import "./interfaces/IBountyEscrow.sol";
import "./libraries/TLSNVerifier.sol";

/// @title DisputeResolver — anonymous community voting for bounty disputes.
/// @notice Uses TLSNotary for identity verification and Semaphore for anonymous voting.
///         Per-dispute Semaphore groups ensure fresh proof of subscription per vote.
contract DisputeResolver is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardTransient {
    // ─── Types ───────────────────────────────────────────────────────────

    enum DisputeStatus {
        None,
        Voting,
        Extended,
        Resolved,
        Escalated
    }

    struct Dispute {
        uint256 votingStart;
        uint256 votingEnd;
        uint256 approveCount;
        uint256 rejectCount;
        DisputeStatus status;
        bool extended;
    }

    // ─── Constants ───────────────────────────────────────────────────────

    /// @dev Scope prefix to prevent nullifier collision with other contracts using the same Semaphore group.
    bytes32 public constant SCOPE_PREFIX = keccak256("neuro-bounty-board.dispute");

    /// @dev Byte pattern that proves the response contains an active subscription.
    ///      Present when subscribed (tier "1000"/"2000"/"3000"), absent when subscriptionBenefit is null.
    bytes public constant SUB_CHECK = '"subscriptionBenefit":{"tier":"';

    // ─── State ───────────────────────────────────────────────────────────

    ISemaphore public semaphore;
    IBountyEscrow public bountyEscrow;

    uint256 public votingPeriod; // seconds
    uint256 public quorum; // minimum total votes
    uint256 public supermajorityBps; // basis points (6667 = 66.67%)

    mapping(uint256 => Dispute) public disputes; // bountyId => Dispute

    // ─── TLSNotary State ────────────────────────────────────────────────

    /// @dev Approved Notary signer addresses (derived from secp256k1 public keys).
    mapping(address => bool) public approvedNotaries;

    /// @dev Minimum number of distinct Notary signatures required (M in M-of-N).
    uint256 public requiredSignatures;

    /// @dev Expected TLS server domain for verification (e.g. "gql.twitch.tv").
    string public expectedDomain;

    /// @dev Per-dispute Semaphore group IDs. Created in openDispute().
    mapping(uint256 => uint256) public disputeGroupIds;

    /// @dev Tracks which Twitch accounts have joined each dispute's voter group.
    mapping(uint256 => mapping(bytes32 => bool)) public hasJoinedDispute;

    // ─── Events ──────────────────────────────────────────────────────────

    event DisputeOpened(uint256 indexed bountyId, uint256 votingEnd);
    event VoteCast(uint256 indexed bountyId, uint256 message);
    event DisputeResolved(uint256 indexed bountyId, IBountyEscrow.DisputeOutcome outcome);
    event DisputeExtended(uint256 indexed bountyId, uint256 newVotingEnd);
    event DisputeEscalated(uint256 indexed bountyId);

    event VotingPeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    event QuorumUpdated(uint256 oldQuorum, uint256 newQuorum);
    event SupermajorityBpsUpdated(uint256 oldBps, uint256 newBps);

    event VoterJoinedDispute(uint256 indexed bountyId, bytes32 indexed twitchIdHash, uint256 identityCommitment);
    event NotaryAdded(address indexed notary);
    event NotaryRemoved(address indexed notary);
    event RequiredSignaturesUpdated(uint256 oldRequired, uint256 newRequired);
    event ExpectedDomainUpdated(string oldDomain, string newDomain);

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotBountyEscrow();
    error DisputeAlreadyExists();
    error DisputeNotActive();
    error VotingPeriodEnded();
    error VotingPeriodNotEnded();
    error InvalidVote();
    error InvalidScope();
    error ZeroAddress();
    error InvalidParameter();
    error NoProofsProvided();
    error InsufficientNotarySignatures();
    error UnknownNotary(address signer);
    error DuplicateNotarySigner(address signer);
    error AlreadyJoinedDispute();
    error ProofTooOld();
    error ChannelNameNotInProof();
    error TwitchIdNotInProof();
    error NotSubscribed();
    error ZeroCommitment();

    // ─── Initializer ─────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _semaphore,
        address _bountyEscrow,
        address[] calldata _notaries,
        uint256 _requiredSignatures,
        string calldata _expectedDomain
    ) external initializer {
        if (_semaphore == address(0) || _bountyEscrow == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);

        semaphore = ISemaphore(_semaphore);
        bountyEscrow = IBountyEscrow(_bountyEscrow);

        for (uint256 i; i < _notaries.length; ++i) {
            approvedNotaries[_notaries[i]] = true;
        }
        requiredSignatures = _requiredSignatures;
        expectedDomain = _expectedDomain;

        votingPeriod = 14 days;
        quorum = 10;
        supermajorityBps = 6667; // 66.67%
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    function addNotary(address _notary) external onlyOwner {
        if (_notary == address(0)) revert ZeroAddress();
        approvedNotaries[_notary] = true;
        emit NotaryAdded(_notary);
    }

    function removeNotary(address _notary) external onlyOwner {
        approvedNotaries[_notary] = false;
        emit NotaryRemoved(_notary);
    }

    function setRequiredSignatures(uint256 _required) external onlyOwner {
        if (_required == 0) revert InvalidParameter();
        emit RequiredSignaturesUpdated(requiredSignatures, _required);
        requiredSignatures = _required;
    }

    function setExpectedDomain(string calldata _domain) external onlyOwner {
        emit ExpectedDomainUpdated(expectedDomain, _domain);
        expectedDomain = _domain;
    }

    function setVotingPeriod(uint256 _period) external onlyOwner {
        if (_period < 1 days) revert InvalidParameter();
        emit VotingPeriodUpdated(votingPeriod, _period);
        votingPeriod = _period;
    }

    function setQuorum(uint256 _quorum) external onlyOwner {
        if (_quorum == 0) revert InvalidParameter();
        emit QuorumUpdated(quorum, _quorum);
        quorum = _quorum;
    }

    function setSupermajorityBps(uint256 _bps) external onlyOwner {
        if (_bps <= 5000 || _bps >= 10_000) revert InvalidParameter();
        emit SupermajorityBpsUpdated(supermajorityBps, _bps);
        supermajorityBps = _bps;
    }

    // ─── Dispute Lifecycle ───────────────────────────────────────────────

    /// @notice Opens a dispute for a bounty. Only callable by BountyEscrow.
    function openDispute(uint256 bountyId) external {
        if (msg.sender != address(bountyEscrow)) revert NotBountyEscrow();
        if (disputes[bountyId].status != DisputeStatus.None) revert DisputeAlreadyExists();

        uint256 end = block.timestamp + votingPeriod;

        disputes[bountyId] = Dispute({
            votingStart: block.timestamp,
            votingEnd: end,
            approveCount: 0,
            rejectCount: 0,
            status: DisputeStatus.Voting,
            extended: false
        });

        // Create a fresh Semaphore group for this dispute's voters
        uint256 groupId = semaphore.createGroup(address(this));
        disputeGroupIds[bountyId] = groupId;

        emit DisputeOpened(bountyId, end);
    }

    /// @notice Join a dispute's voter group by proving Twitch subscription via TLSNotary.
    /// @dev This step is public (links twitchIdHash to identityCommitment). Vote
    ///      separately via castVote() through a relayer for anonymity.
    /// @param bountyId The bounty whose dispute to join.
    /// @param proofs Array of TLSNotary presentations (one per Notary, need >= requiredSignatures).
    /// @param channelName The Twitch channel displayName that must appear in the proof.
    /// @param identityCommitment The voter's Semaphore identity commitment.
    function joinDisputeGroup(
        uint256 bountyId,
        TLSNVerifier.Presentation[] calldata proofs,
        string calldata channelName,
        uint256 identityCommitment
    ) external nonReentrant {
        if (identityCommitment == 0) revert ZeroCommitment();
        if (proofs.length == 0) revert NoProofsProvided();

        Dispute storage d = disputes[bountyId];

        if (d.status != DisputeStatus.Voting && d.status != DisputeStatus.Extended) {
            revert DisputeNotActive();
        }
        if (block.timestamp > d.votingEnd) revert VotingPeriodEnded();

        // Verify TLSNotary proofs and extract Twitch user ID
        bytes32 twitchIdHash = _verifyMultiNotary(proofs, d.votingStart, channelName);

        if (hasJoinedDispute[bountyId][twitchIdHash]) revert AlreadyJoinedDispute();
        hasJoinedDispute[bountyId][twitchIdHash] = true;

        // Add to group — this updates the on-chain Merkle root synchronously
        uint256 groupId = disputeGroupIds[bountyId];
        semaphore.addMember(groupId, identityCommitment);

        emit VoterJoinedDispute(bountyId, twitchIdHash, identityCommitment);
    }

    /// @notice Cast an anonymous vote on an active dispute using a Semaphore ZK proof.
    /// @dev Must have joined via joinDisputeGroup() first. For true anonymity, this
    ///      should be submitted through a relayer that batches votes to prevent timing
    ///      correlation attacks. The relayer should collect votes and submit them in
    ///      randomized batches rather than forwarding individually.
    /// @param bountyId The bounty whose dispute to vote on.
    /// @param voteProof The Semaphore proof (message: 1 = approve, 0 = reject).
    function castVote(
        uint256 bountyId,
        ISemaphore.SemaphoreProof calldata voteProof
    ) external nonReentrant {
        Dispute storage d = disputes[bountyId];

        if (d.status != DisputeStatus.Voting && d.status != DisputeStatus.Extended) {
            revert DisputeNotActive();
        }
        if (block.timestamp > d.votingEnd) revert VotingPeriodEnded();

        if (voteProof.message != 0 && voteProof.message != 1) revert InvalidVote();
        uint256 expectedScope = disputeScope(bountyId);
        if (voteProof.scope != expectedScope) revert InvalidScope();

        uint256 groupId = disputeGroupIds[bountyId];
        semaphore.validateProof(groupId, voteProof);

        if (voteProof.message == 1) {
            d.approveCount++;
        } else {
            d.rejectCount++;
        }

        emit VoteCast(bountyId, voteProof.message);
    }

    /// @notice Resolves a dispute after the voting period ends.
    /// @dev Anyone can call this. Handles quorum extension and escalation.
    function resolveDispute(uint256 bountyId) external nonReentrant {
        Dispute storage d = disputes[bountyId];

        if (d.status != DisputeStatus.Voting && d.status != DisputeStatus.Extended) {
            revert DisputeNotActive();
        }
        if (block.timestamp <= d.votingEnd) revert VotingPeriodNotEnded();

        uint256 totalVotes = d.approveCount + d.rejectCount;

        // Quorum not met
        if (totalVotes < quorum) {
            if (!d.extended) {
                // First extension
                d.extended = true;
                d.status = DisputeStatus.Extended;
                d.votingEnd = block.timestamp + votingPeriod;

                emit DisputeExtended(bountyId, d.votingEnd);
                return;
            }

            // Already extended once — escalate to admin for manual resolution.
            // Funds remain in escrow until admin calls resolveEscalated().
            d.status = DisputeStatus.Escalated;
            emit DisputeEscalated(bountyId);
            return;
        }

        // Quorum met — check supermajority
        if (d.approveCount * 10_000 > totalVotes * supermajorityBps) {
            d.status = DisputeStatus.Resolved;
            bountyEscrow.resolveDispute(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
            emit DisputeResolved(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
        } else if (d.rejectCount * 10_000 > totalVotes * supermajorityBps) {
            d.status = DisputeStatus.Resolved;
            bountyEscrow.resolveDispute(bountyId, IBountyEscrow.DisputeOutcome.SponsorWins);
            emit DisputeResolved(bountyId, IBountyEscrow.DisputeOutcome.SponsorWins);
        } else {
            // No supermajority — escalate to admin for manual resolution
            d.status = DisputeStatus.Escalated;
            emit DisputeEscalated(bountyId);
        }
    }

    /// @notice Admin overrides voting deadline. For testing only — remove before production.
    function adminSetVotingEnd(uint256 bountyId, uint256 newVotingEnd) external onlyOwner {
        disputes[bountyId].votingEnd = newVotingEnd;
    }

    /// @notice Admin manually resolves an escalated dispute.
    /// @dev Only callable when dispute status is Escalated.
    function resolveEscalated(uint256 bountyId, IBountyEscrow.DisputeOutcome outcome) external onlyOwner {
        Dispute storage d = disputes[bountyId];
        if (d.status != DisputeStatus.Escalated) revert DisputeNotActive();

        d.status = DisputeStatus.Resolved;
        bountyEscrow.resolveDispute(bountyId, outcome);

        emit DisputeResolved(bountyId, outcome);
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    /// @dev Verifies M-of-N TLSNotary presentations: signature recovery, attestation hash,
    ///      chunk commitments, domain, freshness, channel name, subscription, and Twitch user ID.
    ///      Returns keccak256 of the extracted Twitch user ID (currentUser.id) for sybil resistance.
    function _verifyMultiNotary(
        TLSNVerifier.Presentation[] calldata proofs,
        uint256 disputeStart,
        string calldata channelName
    ) internal view returns (bytes32 twitchIdHash) {
        uint256 validSigs;
        address[] memory seen = new address[](proofs.length);

        // Build the displayName pattern: "displayName":"<channelName>"
        bytes memory displayNamePattern = abi.encodePacked('"displayName":"', channelName, '"');

        for (uint256 i; i < proofs.length; ++i) {
            // Freshness: proof must be generated after dispute opened
            if (proofs[i].timestamp < disputeStart) revert ProofTooOld();

            // Verify attestation integrity
            TLSNVerifier.verifyAttestationHash(proofs[i]);
            TLSNVerifier.verifyChunkCommitments(proofs[i]);
            TLSNVerifier.verifyDomain(proofs[i], expectedDomain);

            // Verify channel name, subscription, and extract voter's Twitch user ID
            bool channelFound;
            bool subFound;
            bytes memory extractedId;
            for (uint256 j; j < proofs[i].revealedChunks.length; ++j) {
                bytes memory chunk = proofs[i].revealedChunks[j];
                if (!channelFound && TLSNVerifier.containsBytes(chunk, displayNamePattern)) {
                    channelFound = true;
                }
                if (!subFound && TLSNVerifier.containsBytes(chunk, SUB_CHECK)) {
                    subFound = true;
                }
                if (extractedId.length == 0) {
                    extractedId = TLSNVerifier.extractJsonStringValue(chunk, "id");
                }
                if (channelFound && subFound && extractedId.length > 0) break;
            }
            if (!channelFound) revert ChannelNameNotInProof();
            if (!subFound) revert NotSubscribed();
            if (extractedId.length == 0) revert TwitchIdNotInProof();

            // All proofs must contain the same Twitch user ID (currentUser.id)
            bytes32 thisIdHash = keccak256(extractedId);
            if (i == 0) {
                twitchIdHash = thisIdHash;
            } else if (thisIdHash != twitchIdHash) {
                revert TwitchIdNotInProof();
            }

            // Recover and validate signer
            address signer = TLSNVerifier.recoverSigner(proofs[i]);
            if (!approvedNotaries[signer]) revert UnknownNotary(signer);

            // Deduplicate signers
            for (uint256 k; k < i; ++k) {
                if (seen[k] == signer) revert DuplicateNotarySigner(signer);
            }
            seen[i] = signer;
            ++validSigs;
        }

        if (validSigs < requiredSignatures) revert InsufficientNotarySignatures();
    }

    // ─── Views ───────────────────────────────────────────────────────────

    function getDispute(uint256 bountyId) external view returns (Dispute memory) {
        return disputes[bountyId];
    }

    /// @notice Returns the namespaced Semaphore scope for a given bountyId.
    function disputeScope(uint256 bountyId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(SCOPE_PREFIX, bountyId)));
    }

    // ─── Upgrade Auth ────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── Storage Gap ─────────────────────────────────────────────────────

    uint256[50] private __gap;
}
