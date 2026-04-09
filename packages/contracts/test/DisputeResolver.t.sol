// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/BountyEscrow.sol";
import "../src/DisputeResolver.sol";
import "../src/libraries/TLSNVerifier.sol";
import "../src/interfaces/ISemaphore.sol";
import "../src/interfaces/IBountyEscrow.sol";
import "./mocks/MockEURC.sol";
import "./mocks/MockSemaphore.sol";

contract DisputeResolverTest is Test {
    BountyEscrow public escrow;
    DisputeResolver public resolver;
    MockEURC public eurc;
    MockSemaphore public semaphore;

    address public owner = address(this);
    address public sponsor = makeAddr("sponsor");
    address public dev = makeAddr("dev");
    address public treasury = makeAddr("treasury");

    // Notary keys for testing
    uint256 constant NOTARY1_PK = 0xA11CE;
    uint256 constant NOTARY2_PK = 0xB0B;
    uint256 constant NOTARY3_PK = 0xCA70;
    address notary1;
    address notary2;
    address notary3;

    uint256 public constant REWARD = 2000e6;

    function setUp() public {
        notary1 = vm.addr(NOTARY1_PK);
        notary2 = vm.addr(NOTARY2_PK);
        notary3 = vm.addr(NOTARY3_PK);

        eurc = new MockEURC();
        semaphore = new MockSemaphore();

        // Deploy escrow
        BountyEscrow escrowImpl = new BountyEscrow();
        ERC1967Proxy escrowProxy =
            new ERC1967Proxy(address(escrowImpl), abi.encodeCall(BountyEscrow.initialize, (address(eurc), treasury)));
        escrow = BountyEscrow(address(escrowProxy));

        // Deploy resolver with TLSNotary config
        address[] memory notaries = new address[](3);
        notaries[0] = notary1;
        notaries[1] = notary2;
        notaries[2] = notary3;

        DisputeResolver resolverImpl = new DisputeResolver();
        ERC1967Proxy resolverProxy = new ERC1967Proxy(
            address(resolverImpl),
            abi.encodeCall(
                DisputeResolver.initialize,
                (address(semaphore), address(escrow), notaries, 2, "gql.twitch.tv")
            )
        );
        resolver = DisputeResolver(address(resolverProxy));

        // Wire
        escrow.setDisputeResolver(address(resolver));

        // Fund and approve
        eurc.mint(sponsor, 100_000e6);
        eurc.mint(dev, 100_000e6);
        vm.prank(sponsor);
        eurc.approve(address(escrow), type(uint256).max);
        vm.prank(dev);
        eurc.approve(address(escrow), type(uint256).max);
    }

    // ─── TLSN Proof Helpers ─────────────────────────────────────────────

    // Real Twitch GQL response body captured from TLSNotary plugin (2026-04-08).
    // Subscribed to vedal987 channel, tier 1000:
    string constant REAL_RESPONSE_SUBSCRIBED =
        '{"data":{"currentUser":{"id":"156846120"},"user":{"displayName":"vedal987","self":{"subscriptionBenefit":{"tier":"1000","purchasedWithPrime":false}}}},"extensions":{"durationMilliseconds":47,"requestID":"01KNQ7NQEA9GZAB51J44H8AR5Y"}}';

    // Channel name used across all tests (the streamer being subscribed to)
    string constant CHANNEL = "vedal987";

    /// @dev Derive a deterministic fake Twitch user ID from a voter label (for unique sybil keys in tests).
    function _twitchId(string memory voterLabel) internal pure returns (string memory) {
        uint256 h = uint256(keccak256(abi.encodePacked(voterLabel))) % 1_000_000_000;
        return vm.toString(h);
    }

    /// @dev Build chunk data for a subscribed voter proving their sub to vedal987.
    ///      voterLabel is used to derive a unique Twitch user ID (currentUser.id).
    function _buildChunkData(string memory voterLabel)
        internal
        pure
        returns (bytes32[] memory commitments, bytes[] memory chunks, bytes32[] memory salts, uint256[] memory indices)
    {
        bytes memory chunk = abi.encodePacked(
            '{"data":{"currentUser":{"id":"', _twitchId(voterLabel),
            '"},"user":{"displayName":"', CHANNEL,
            '","self":{"subscriptionBenefit":{"tier":"1000","purchasedWithPrime":false}}}},"extensions":{"durationMilliseconds":47,"requestID":"01KNQ7NQEA9GZAB51J44H8AR5Y"}}'
        );
        bytes32 salt = keccak256("salt0");

        commitments = new bytes32[](1);
        commitments[0] = keccak256(abi.encodePacked(chunk, salt));

        chunks = new bytes[](1);
        chunks[0] = chunk;

        salts = new bytes32[](1);
        salts[0] = salt;

        indices = new uint256[](1);
        indices[0] = 0;
    }

    /// @dev Build chunk data for an UNSUBSCRIBED voter (subscriptionBenefit is null).
    function _buildUnsubscribedChunkData(string memory voterLabel)
        internal
        pure
        returns (bytes32[] memory commitments, bytes[] memory chunks, bytes32[] memory salts, uint256[] memory indices)
    {
        bytes memory chunk = abi.encodePacked(
            '{"data":{"currentUser":{"id":"', _twitchId(voterLabel),
            '"},"user":{"displayName":"', CHANNEL,
            '","self":{"subscriptionBenefit":null}}},"extensions":{"durationMilliseconds":47,"requestID":"01KNQ7NQEA9GZAB51J44H8AR5Y"}}'
        );
        bytes32 salt = keccak256("salt0");

        commitments = new bytes32[](1);
        commitments[0] = keccak256(abi.encodePacked(chunk, salt));

        chunks = new bytes[](1);
        chunks[0] = chunk;

        salts = new bytes32[](1);
        salts[0] = salt;

        indices = new uint256[](1);
        indices[0] = 0;
    }

    /// @dev Build a presentation for an unsubscribed user.
    function _buildUnsubscribedPresentation(uint256 notaryPk, string memory twitchUsername, uint256 timestamp)
        internal
        pure
        returns (TLSNVerifier.Presentation memory proof)
    {
        (bytes32[] memory commitments, bytes[] memory chunks, bytes32[] memory salts, uint256[] memory indices) =
            _buildUnsubscribedChunkData(twitchUsername);

        bytes32 attestationHash =
            keccak256(abi.encodePacked("gql.twitch.tv", abi.encodePacked(commitments), timestamp));

        bytes32 ethSignedHash =
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", attestationHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(notaryPk, ethSignedHash);

        proof = TLSNVerifier.Presentation({
            signature: abi.encodePacked(r, s, v),
            attestationHash: attestationHash,
            serverDomain: "gql.twitch.tv",
            timestamp: timestamp,
            commitments: commitments,
            revealedChunks: chunks,
            salts: salts,
            chunkIndices: indices
        });
    }

    /// @dev Build a single TLSNotary presentation signed by a specific notary.
    function _buildPresentation(uint256 notaryPk, string memory twitchUsername, uint256 timestamp)
        internal
        pure
        returns (TLSNVerifier.Presentation memory proof)
    {
        (bytes32[] memory commitments, bytes[] memory chunks, bytes32[] memory salts, uint256[] memory indices) =
            _buildChunkData(twitchUsername);

        bytes32 attestationHash =
            keccak256(abi.encodePacked("gql.twitch.tv", abi.encodePacked(commitments), timestamp));

        bytes32 ethSignedHash =
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", attestationHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(notaryPk, ethSignedHash);

        proof = TLSNVerifier.Presentation({
            signature: abi.encodePacked(r, s, v),
            attestationHash: attestationHash,
            serverDomain: "gql.twitch.tv",
            timestamp: timestamp,
            commitments: commitments,
            revealedChunks: chunks,
            salts: salts,
            chunkIndices: indices
        });
    }

    /// @dev Build M-of-N TLSNotary proofs (2 notaries by default).
    function _makeTLSNProofs(string memory twitchUsername, uint256 timestamp)
        internal
        pure
        returns (TLSNVerifier.Presentation[] memory)
    {
        TLSNVerifier.Presentation[] memory proofs = new TLSNVerifier.Presentation[](2);
        proofs[0] = _buildPresentation(NOTARY1_PK, twitchUsername, timestamp);
        proofs[1] = _buildPresentation(NOTARY2_PK, twitchUsername, timestamp);
        return proofs;
    }

    function _makeProof(uint256 bountyId, uint256 vote, uint256 nullifier)
        internal
        view
        returns (ISemaphore.SemaphoreProof memory)
    {
        return ISemaphore.SemaphoreProof({
            merkleTreeDepth: 20,
            merkleTreeRoot: 0,
            nullifier: nullifier,
            message: vote,
            scope: resolver.disputeScope(bountyId),
            points: [uint256(0), 0, 0, 0, 0, 0, 0, 0]
        });
    }

    // ─── Bounty Helpers ─────────────────────────────────────────────────

    function _createDisputedBounty() internal returns (uint256) {
        vm.prank(sponsor);
        uint256 bountyId = escrow.createBounty(keccak256("test"), block.timestamp + 30 days, REWARD);
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);
        vm.prank(dev);
        escrow.stakeBond(bountyId);
        vm.prank(dev);
        escrow.submitDeliverable(bountyId, "ipfs://proof");
        vm.prank(sponsor);
        escrow.rejectDeliverable(bountyId);
        return bountyId;
    }

    /// @dev Join a dispute group and cast a vote (two separate calls).
    function _joinAndVote(uint256 bountyId, string memory voterLabel, uint256 identityCommitment, uint256 vote)
        internal
    {
        TLSNVerifier.Presentation[] memory proofs = _makeTLSNProofs(voterLabel, block.timestamp);
        ISemaphore.SemaphoreProof memory voteProof = _makeProof(bountyId, vote, identityCommitment);

        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, identityCommitment);
        resolver.castVote(bountyId, voteProof);
    }

    /// @dev Cast multiple votes with unique identities.
    function _castVotes(uint256 bountyId, uint256 approves, uint256 rejects) internal {
        for (uint256 i; i < approves; ++i) {
            string memory voterLabel = string(abi.encodePacked("approver", vm.toString(i)));
            _joinAndVote(bountyId, voterLabel, 1000 + i, 1);
        }
        for (uint256 i; i < rejects; ++i) {
            string memory voterLabel = string(abi.encodePacked("rejector", vm.toString(i)));
            _joinAndVote(bountyId, voterLabel, 2000 + i, 0);
        }
    }

    // ─── Open Dispute ───────────────────────────────────────────────────

    function test_openDispute() public {
        uint256 bountyId = _createDisputedBounty();

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(uint8(d.status), uint8(DisputeResolver.DisputeStatus.Voting));
        assertEq(d.votingEnd, d.votingStart + 14 days);
    }

    function test_openDispute_createsSemaphoreGroup() public {
        uint256 bountyId = _createDisputedBounty();

        uint256 groupId = resolver.disputeGroupIds(bountyId);
        // Group admin should be the resolver
        assertEq(semaphore.getGroupAdmin(groupId), address(resolver));
    }

    function test_openDispute_multipleDisputes_separateGroups() public {
        uint256 bountyId1 = _createDisputedBounty();

        // Create second bounty and dispute
        vm.prank(sponsor);
        uint256 bountyId2 = escrow.createBounty(keccak256("test2"), block.timestamp + 30 days, REWARD);
        vm.prank(sponsor);
        escrow.approveDev(bountyId2, dev);
        vm.prank(dev);
        escrow.stakeBond(bountyId2);
        vm.prank(dev);
        escrow.submitDeliverable(bountyId2, "ipfs://proof2");
        vm.prank(sponsor);
        escrow.rejectDeliverable(bountyId2);

        assertNotEq(resolver.disputeGroupIds(bountyId1), resolver.disputeGroupIds(bountyId2));
    }

    function test_openDispute_notEscrow_reverts() public {
        vm.expectRevert(DisputeResolver.NotBountyEscrow.selector);
        resolver.openDispute(0);
    }

    function test_openDispute_duplicate_reverts() public {
        uint256 bountyId = _createDisputedBounty();
        vm.prank(address(escrow));
        vm.expectRevert(DisputeResolver.DisputeAlreadyExists.selector);
        resolver.openDispute(bountyId);
    }

    // ─── Join And Vote ──────────────────────────────────────────────────

    function test_joinAndVote_approve() public {
        uint256 bountyId = _createDisputedBounty();
        _joinAndVote(bountyId, "voter1", 100, 1);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(d.approveCount, 1);
        assertEq(d.rejectCount, 0);

        // Verify member was added to group
        uint256 groupId = resolver.disputeGroupIds(bountyId);
        uint256[] memory members = semaphore.getGroupMembers(groupId);
        assertEq(members.length, 1);
        assertEq(members[0], 100);

        // Sybil key is derived from currentUser.id in the proof
        bytes32 twitchIdHash = keccak256(bytes(_twitchId("voter1")));
        assertTrue(resolver.hasJoinedDispute(bountyId, twitchIdHash));
    }

    function test_joinAndVote_reject() public {
        uint256 bountyId = _createDisputedBounty();
        _joinAndVote(bountyId, "voter1", 100, 0);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(d.approveCount, 0);
        assertEq(d.rejectCount, 1);
    }

    function test_joinAndVote_emitsBothEvents() public {
        uint256 bountyId = _createDisputedBounty();

        bytes32 twitchIdHash = keccak256(bytes(_twitchId("voter1")));
        TLSNVerifier.Presentation[] memory proofs = _makeTLSNProofs("voter1", block.timestamp);
        ISemaphore.SemaphoreProof memory voteProof = _makeProof(bountyId, 1, 100);

        vm.expectEmit(true, true, false, true);
        emit DisputeResolver.VoterJoinedDispute(bountyId, twitchIdHash, 100);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);

        vm.expectEmit(true, false, false, true);
        emit DisputeResolver.VoteCast(bountyId, 1);
        resolver.castVote(bountyId, voteProof);
    }

    function test_joinAndVote_multipleVoters() public {
        uint256 bountyId = _createDisputedBounty();

        _joinAndVote(bountyId, "voter1", 100, 1);
        _joinAndVote(bountyId, "voter2", 200, 0);
        _joinAndVote(bountyId, "voter3", 300, 1);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(d.approveCount, 2);
        assertEq(d.rejectCount, 1);
    }

    function test_joinDisputeGroup_alreadyJoined_reverts() public {
        uint256 bountyId = _createDisputedBounty();
        _joinAndVote(bountyId, "voter1", 100, 1);

        // Same Twitch ID tries again
        TLSNVerifier.Presentation[] memory proofs = _makeTLSNProofs("voter1", block.timestamp);

        vm.expectRevert(DisputeResolver.AlreadyJoinedDispute.selector);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 200);
    }

    function test_castVote_invalidVote_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        ISemaphore.SemaphoreProof memory badProof = _makeProof(bountyId, 2, 100);

        vm.expectRevert(DisputeResolver.InvalidVote.selector);
        resolver.castVote(bountyId, badProof);
    }

    function test_castVote_wrongScope_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        ISemaphore.SemaphoreProof memory badProof = _makeProof(bountyId, 1, 100);
        badProof.scope = 9999;

        vm.expectRevert(DisputeResolver.InvalidScope.selector);
        resolver.castVote(bountyId, badProof);
    }

    function test_joinDisputeGroup_insufficientSignatures_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        TLSNVerifier.Presentation[] memory proofs = new TLSNVerifier.Presentation[](1);
        proofs[0] = _buildPresentation(NOTARY1_PK, "voter1", block.timestamp);

        vm.expectRevert(DisputeResolver.InsufficientNotarySignatures.selector);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);
    }

    function test_joinDisputeGroup_unknownNotary_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        uint256 fakePk = 0xDEAD;
        TLSNVerifier.Presentation[] memory proofs = new TLSNVerifier.Presentation[](2);
        proofs[0] = _buildPresentation(NOTARY1_PK, "voter1", block.timestamp);
        proofs[1] = _buildPresentation(fakePk, "voter1", block.timestamp);

        vm.expectRevert(abi.encodeWithSelector(DisputeResolver.UnknownNotary.selector, vm.addr(fakePk)));
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);
    }

    function test_joinDisputeGroup_duplicateNotary_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        TLSNVerifier.Presentation[] memory proofs = new TLSNVerifier.Presentation[](2);
        proofs[0] = _buildPresentation(NOTARY1_PK, "voter1", block.timestamp);
        proofs[1] = _buildPresentation(NOTARY1_PK, "voter1", block.timestamp);

        vm.expectRevert(abi.encodeWithSelector(DisputeResolver.DuplicateNotarySigner.selector, notary1));
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);
    }

    function test_joinDisputeGroup_proofTooOld_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        TLSNVerifier.Presentation[] memory proofs = _makeTLSNProofs("voter1", block.timestamp - 1);

        vm.expectRevert(DisputeResolver.ProofTooOld.selector);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);
    }

    function test_joinDisputeGroup_wrongDomain_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        (bytes32[] memory commitments, bytes[] memory chunks, bytes32[] memory salts, uint256[] memory indices) =
            _buildChunkData("voter1");

        bytes32 attestationHash =
            keccak256(abi.encodePacked("evil.com", abi.encodePacked(commitments), block.timestamp));
        bytes32 ethSignedHash =
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", attestationHash));

        TLSNVerifier.Presentation[] memory proofs = new TLSNVerifier.Presentation[](2);
        for (uint256 i; i < 2; ++i) {
            uint256 pk = i == 0 ? NOTARY1_PK : NOTARY2_PK;
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethSignedHash);
            proofs[i] = TLSNVerifier.Presentation({
                signature: abi.encodePacked(r, s, v),
                attestationHash: attestationHash,
                serverDomain: "evil.com",
                timestamp: block.timestamp,
                commitments: commitments,
                revealedChunks: chunks,
                salts: salts,
                chunkIndices: indices
            });
        }

        vm.expectRevert(TLSNVerifier.DomainMismatch.selector);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);
    }

    function test_joinDisputeGroup_wrongChannel_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        TLSNVerifier.Presentation[] memory proofs = _makeTLSNProofs("voter1", block.timestamp);

        vm.expectRevert(DisputeResolver.ChannelNameNotInProof.selector);
        resolver.joinDisputeGroup(bountyId, proofs, "fakechannel", 100);
    }

    function test_joinDisputeGroup_disputeNotActive_reverts() public {
        TLSNVerifier.Presentation[] memory proofs = _makeTLSNProofs("voter1", block.timestamp);

        vm.expectRevert(DisputeResolver.DisputeNotActive.selector);
        resolver.joinDisputeGroup(999, proofs, CHANNEL, 100);
    }

    function test_joinDisputeGroup_afterVotingPeriod_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        vm.warp(block.timestamp + 14 days + 1);

        TLSNVerifier.Presentation[] memory proofs = _makeTLSNProofs("voter1", block.timestamp);

        vm.expectRevert(DisputeResolver.VotingPeriodEnded.selector);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);
    }

    function test_joinDisputeGroup_notSubscribed_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        TLSNVerifier.Presentation[] memory proofs = new TLSNVerifier.Presentation[](2);
        proofs[0] = _buildUnsubscribedPresentation(NOTARY1_PK, "voter1", block.timestamp);
        proofs[1] = _buildUnsubscribedPresentation(NOTARY2_PK, "voter1", block.timestamp);

        vm.expectRevert(DisputeResolver.NotSubscribed.selector);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);
    }

    function test_joinDisputeGroup_zeroCommitment_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        TLSNVerifier.Presentation[] memory proofs = _makeTLSNProofs("voter1", block.timestamp);

        vm.expectRevert(DisputeResolver.ZeroCommitment.selector);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 0);
    }

    function test_joinDisputeGroup_noProofs_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        TLSNVerifier.Presentation[] memory proofs = new TLSNVerifier.Presentation[](0);

        vm.expectRevert(DisputeResolver.NoProofsProvided.selector);
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 100);
    }

    function test_castVote_disputeNotActive_reverts() public {
        ISemaphore.SemaphoreProof memory voteProof = _makeProof(999, 1, 100);

        vm.expectRevert(DisputeResolver.DisputeNotActive.selector);
        resolver.castVote(999, voteProof);
    }

    function test_castVote_afterVotingPeriod_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        vm.warp(block.timestamp + 14 days + 1);

        ISemaphore.SemaphoreProof memory voteProof = _makeProof(bountyId, 1, 100);

        vm.expectRevert(DisputeResolver.VotingPeriodEnded.selector);
        resolver.castVote(bountyId, voteProof);
    }

    // ─── Resolve Dispute ────────────────────────────────────────────────

    function test_resolveDispute_devWins_supermajority() public {
        uint256 bountyId = _createDisputedBounty();

        // 8 approve, 2 reject = 80% > 66.67%
        _castVotes(bountyId, 8, 2);

        vm.warp(block.timestamp + 14 days + 1);

        uint256 devBefore = eurc.balanceOf(dev);
        uint256 bond = escrow.getBounty(bountyId).bond;
        resolver.resolveDispute(bountyId);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(uint8(d.status), uint8(DisputeResolver.DisputeStatus.Resolved));
        assertEq(eurc.balanceOf(dev), devBefore + REWARD + bond);
    }

    function test_resolveDispute_sponsorWins_supermajority() public {
        uint256 bountyId = _createDisputedBounty();

        // 2 approve, 8 reject = 80% reject > 66.67%
        _castVotes(bountyId, 2, 8);

        vm.warp(block.timestamp + 14 days + 1);

        uint256 sponsorBefore = eurc.balanceOf(sponsor);
        uint256 treasuryBefore = eurc.balanceOf(treasury);
        uint256 bond = escrow.getBounty(bountyId).bond;
        resolver.resolveDispute(bountyId);

        assertEq(eurc.balanceOf(sponsor), sponsorBefore + REWARD);
        assertEq(eurc.balanceOf(treasury), treasuryBefore + bond);
    }

    function test_resolveDispute_noSupermajority_escalates() public {
        uint256 bountyId = _createDisputedBounty();

        // 6 approve, 4 reject = 60% — no supermajority either way
        _castVotes(bountyId, 6, 4);

        vm.warp(block.timestamp + 14 days + 1);

        resolver.resolveDispute(bountyId);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(uint8(d.status), uint8(DisputeResolver.DisputeStatus.Escalated));

        // Funds still in escrow
        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Disputed));
    }

    function test_resolveDispute_beforeVotingEnds_reverts() public {
        uint256 bountyId = _createDisputedBounty();
        _castVotes(bountyId, 10, 0);

        vm.expectRevert(DisputeResolver.VotingPeriodNotEnded.selector);
        resolver.resolveDispute(bountyId);
    }

    // ─── Quorum Extension ───────────────────────────────────────────────

    function test_resolveDispute_noQuorum_extends() public {
        uint256 bountyId = _createDisputedBounty();

        // Only 5 votes, quorum is 10
        _castVotes(bountyId, 3, 2);

        vm.warp(block.timestamp + 14 days + 1);

        resolver.resolveDispute(bountyId);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(uint8(d.status), uint8(DisputeResolver.DisputeStatus.Extended));
        assertTrue(d.extended);
        assertGt(d.votingEnd, block.timestamp);
    }

    function test_resolveDispute_noQuorum_afterExtension_escalates() public {
        uint256 bountyId = _createDisputedBounty();

        // Only 5 votes first round
        _castVotes(bountyId, 3, 2);

        vm.warp(block.timestamp + 14 days + 1);
        resolver.resolveDispute(bountyId); // extends

        // Add 2 more during extension (still < 10 quorum)
        _joinAndVote(bountyId, "ext_voter0", 5000, 1);
        _joinAndVote(bountyId, "ext_voter1", 5001, 1);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        vm.warp(d.votingEnd + 1);

        resolver.resolveDispute(bountyId); // escalates

        d = resolver.getDispute(bountyId);
        assertEq(uint8(d.status), uint8(DisputeResolver.DisputeStatus.Escalated));
    }

    function test_canVoteDuringExtension() public {
        uint256 bountyId = _createDisputedBounty();

        _castVotes(bountyId, 3, 2);

        vm.warp(block.timestamp + 14 days + 1);
        resolver.resolveDispute(bountyId); // extends

        // Should be able to join and vote during extension
        _joinAndVote(bountyId, "ext_voter", 9999, 1);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(d.approveCount, 4);
    }

    // ─── Resolve Escalated ──────────────────────────────────────────────

    function test_resolveEscalated_devWins() public {
        uint256 bountyId = _createDisputedBounty();
        _castVotes(bountyId, 6, 4);
        vm.warp(block.timestamp + 14 days + 1);
        resolver.resolveDispute(bountyId); // escalates (no supermajority)

        uint256 devBefore = eurc.balanceOf(dev);
        uint256 bond = escrow.getBounty(bountyId).bond;

        resolver.resolveEscalated(bountyId, IBountyEscrow.DisputeOutcome.DevWins);

        assertEq(eurc.balanceOf(dev), devBefore + REWARD + bond);

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(uint8(d.status), uint8(DisputeResolver.DisputeStatus.Resolved));
    }

    function test_resolveEscalated_sponsorWins() public {
        uint256 bountyId = _createDisputedBounty();
        _castVotes(bountyId, 6, 4);
        vm.warp(block.timestamp + 14 days + 1);
        resolver.resolveDispute(bountyId);

        uint256 sponsorBefore = eurc.balanceOf(sponsor);
        uint256 treasuryBefore = eurc.balanceOf(treasury);
        uint256 bond = escrow.getBounty(bountyId).bond;

        resolver.resolveEscalated(bountyId, IBountyEscrow.DisputeOutcome.SponsorWins);

        assertEq(eurc.balanceOf(sponsor), sponsorBefore + REWARD);
        assertEq(eurc.balanceOf(treasury), treasuryBefore + bond);
    }

    function test_resolveEscalated_notOwner_reverts() public {
        uint256 bountyId = _createDisputedBounty();
        _castVotes(bountyId, 6, 4);
        vm.warp(block.timestamp + 14 days + 1);
        resolver.resolveDispute(bountyId);

        vm.prank(makeAddr("anyone"));
        vm.expectRevert();
        resolver.resolveEscalated(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
    }

    function test_resolveEscalated_notEscalated_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        vm.expectRevert(DisputeResolver.DisputeNotActive.selector);
        resolver.resolveEscalated(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function test_addNotary() public {
        address newNotary = makeAddr("newNotary");

        vm.expectEmit(true, false, false, false);
        emit DisputeResolver.NotaryAdded(newNotary);
        resolver.addNotary(newNotary);

        assertTrue(resolver.approvedNotaries(newNotary));
    }

    function test_addNotary_zeroAddress_reverts() public {
        vm.expectRevert(DisputeResolver.ZeroAddress.selector);
        resolver.addNotary(address(0));
    }

    function test_addNotary_notOwner_reverts() public {
        vm.prank(makeAddr("anyone"));
        vm.expectRevert();
        resolver.addNotary(makeAddr("notary"));
    }

    function test_removeNotary() public {
        vm.expectEmit(true, false, false, false);
        emit DisputeResolver.NotaryRemoved(notary1);
        resolver.removeNotary(notary1);

        assertFalse(resolver.approvedNotaries(notary1));
    }

    function test_setRequiredSignatures() public {
        vm.expectEmit(false, false, false, true);
        emit DisputeResolver.RequiredSignaturesUpdated(2, 3);
        resolver.setRequiredSignatures(3);

        assertEq(resolver.requiredSignatures(), 3);
    }

    function test_setRequiredSignatures_zero_reverts() public {
        vm.expectRevert(DisputeResolver.InvalidParameter.selector);
        resolver.setRequiredSignatures(0);
    }

    function test_setExpectedDomain() public {
        resolver.setExpectedDomain("api.twitch.tv");
        assertEq(resolver.expectedDomain(), "api.twitch.tv");
    }

    function test_setVotingPeriod_tooShort_reverts() public {
        vm.expectRevert(DisputeResolver.InvalidParameter.selector);
        resolver.setVotingPeriod(1 hours);
    }

    function test_setQuorum_zero_reverts() public {
        vm.expectRevert(DisputeResolver.InvalidParameter.selector);
        resolver.setQuorum(0);
    }

    function test_setSupermajorityBps_outOfRange_reverts() public {
        vm.expectRevert(DisputeResolver.InvalidParameter.selector);
        resolver.setSupermajorityBps(5000);

        vm.expectRevert(DisputeResolver.InvalidParameter.selector);
        resolver.setSupermajorityBps(10_000);
    }

    // ─── Events ─────────────────────────────────────────────────────────

    function test_resolveDispute_emitsResolvedEvent() public {
        uint256 bountyId = _createDisputedBounty();
        _castVotes(bountyId, 8, 2);
        vm.warp(block.timestamp + 14 days + 1);

        vm.expectEmit(true, false, false, true);
        emit DisputeResolver.DisputeResolved(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
        resolver.resolveDispute(bountyId);
    }

    function test_resolveDispute_emitsExtendedEvent() public {
        uint256 bountyId = _createDisputedBounty();
        _castVotes(bountyId, 3, 2);
        vm.warp(block.timestamp + 14 days + 1);

        vm.expectEmit(true, false, false, false);
        emit DisputeResolver.DisputeExtended(bountyId, 0);
        resolver.resolveDispute(bountyId);
    }

    function test_resolveDispute_emitsEscalatedEvent() public {
        uint256 bountyId = _createDisputedBounty();
        _castVotes(bountyId, 6, 4);
        vm.warp(block.timestamp + 14 days + 1);

        vm.expectEmit(true, false, false, false);
        emit DisputeResolver.DisputeEscalated(bountyId);
        resolver.resolveDispute(bountyId);
    }

    // ─── Scope ──────────────────────────────────────────────────────────

    function test_disputeScope_isNamespaced() public view {
        uint256 scope0 = resolver.disputeScope(0);
        uint256 scope1 = resolver.disputeScope(1);

        assertNotEq(scope0, scope1);
        assertNotEq(scope0, 0);
    }

    // ─── UUPS Upgrade ──────────────────────────────────────────────────

    function test_upgrade_asOwner() public {
        DisputeResolver newImpl = new DisputeResolver();
        resolver.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_notOwner_reverts() public {
        DisputeResolver newImpl = new DisputeResolver();
        vm.prank(makeAddr("anyone"));
        vm.expectRevert();
        resolver.upgradeToAndCall(address(newImpl), "");
    }

    // ─── Real Proof Data ─────────────────────────────────────────────────

    function test_joinDisputeGroup_realTwitchResponse() public {
        uint256 bountyId = _createDisputedBounty();

        // Use the exact response body from a real TLSNotary proof (vedal987, T1 sub)
        bytes memory realChunk = bytes(REAL_RESPONSE_SUBSCRIBED);
        bytes32 salt = keccak256("realsalt");

        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = keccak256(abi.encodePacked(realChunk, salt));

        bytes[] memory chunks = new bytes[](1);
        chunks[0] = realChunk;

        bytes32[] memory salts = new bytes32[](1);
        salts[0] = salt;

        uint256[] memory indices = new uint256[](1);
        indices[0] = 0;

        bytes32 attestationHash =
            keccak256(abi.encodePacked("gql.twitch.tv", abi.encodePacked(commitments), block.timestamp));

        TLSNVerifier.Presentation[] memory proofs = new TLSNVerifier.Presentation[](2);
        for (uint256 i; i < 2; ++i) {
            uint256 pk = i == 0 ? NOTARY1_PK : NOTARY2_PK;
            bytes32 ethSignedHash =
                keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", attestationHash));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethSignedHash);

            proofs[i] = TLSNVerifier.Presentation({
                signature: abi.encodePacked(r, s, v),
                attestationHash: attestationHash,
                serverDomain: "gql.twitch.tv",
                timestamp: block.timestamp,
                commitments: commitments,
                revealedChunks: chunks,
                salts: salts,
                chunkIndices: indices
            });
        }

        // Channel is vedal987; sybil key is derived from currentUser.id ("156846120")
        resolver.joinDisputeGroup(bountyId, proofs, CHANNEL, 42);
        ISemaphore.SemaphoreProof memory voteProof = _makeProof(bountyId, 1, 42);
        resolver.castVote(bountyId, voteProof);

        bytes32 twitchIdHash = keccak256("156846120");
        assertTrue(resolver.hasJoinedDispute(bountyId, twitchIdHash));
    }

    function test_joinDisputeGroup_realResponse_containsSubscriptionCheck() public {
        // Verify the real response body passes the SUB_CHECK ('"subscriptionBenefit":{"tier":"')
        bytes memory body = bytes(REAL_RESPONSE_SUBSCRIBED);
        bytes memory subCheck = bytes('"subscriptionBenefit":{"tier":"');
        bool found = false;
        for (uint256 i; i <= body.length - subCheck.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < subCheck.length; ++j) {
                if (body[i + j] != subCheck[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                found = true;
                break;
            }
        }
        assertTrue(found, "Real response must contain subscription tier marker");
    }

    // ─── Re-initialization ─────────────────────────────────────────────

    function test_initialize_twice_reverts() public {
        address[] memory notaries = new address[](1);
        notaries[0] = makeAddr("notary");

        vm.expectRevert();
        resolver.initialize(address(semaphore), address(escrow), notaries, 1, "gql.twitch.tv");
    }
}
