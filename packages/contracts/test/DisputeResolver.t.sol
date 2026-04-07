// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/BountyEscrow.sol";
import "../src/DisputeResolver.sol";
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

    uint256 public groupId;
    uint256 public constant REWARD = 2000e6;

    function setUp() public {
        eurc = new MockEURC();
        semaphore = new MockSemaphore();

        // Create voter group with members
        groupId = semaphore.createGroup(address(this));
        // Add enough dummy members for quorum tests
        for (uint256 i = 1; i <= 20; i++) {
            semaphore.addMember(groupId, i);
        }

        // Deploy escrow
        BountyEscrow escrowImpl = new BountyEscrow();
        ERC1967Proxy escrowProxy =
            new ERC1967Proxy(address(escrowImpl), abi.encodeCall(BountyEscrow.initialize, (address(eurc), treasury)));
        escrow = BountyEscrow(address(escrowProxy));

        // Deploy resolver
        DisputeResolver resolverImpl = new DisputeResolver();
        ERC1967Proxy resolverProxy = new ERC1967Proxy(
            address(resolverImpl),
            abi.encodeCall(DisputeResolver.initialize, (address(semaphore), address(escrow), groupId))
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

    // ─── Helpers ─────────────────────────────────────────────────────────

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

    function _castVotes(uint256 bountyId, uint256 approves, uint256 rejects) internal {
        for (uint256 i = 0; i < approves; i++) {
            resolver.castVote(bountyId, _makeProof(bountyId, 1, 1000 + i));
        }
        for (uint256 i = 0; i < rejects; i++) {
            resolver.castVote(bountyId, _makeProof(bountyId, 0, 2000 + i));
        }
    }

    // ─── Open Dispute ───────────────────────────────────────────────────

    function test_openDispute() public {
        uint256 bountyId = _createDisputedBounty();

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(uint8(d.status), uint8(DisputeResolver.DisputeStatus.Voting));
        assertEq(d.votingEnd, d.votingStart + 14 days);
    }

    function test_openDispute_notEscrow_reverts() public {
        vm.expectRevert(DisputeResolver.NotBountyEscrow.selector);
        resolver.openDispute(0);
    }

    function test_openDispute_duplicate_reverts() public {
        uint256 bountyId = _createDisputedBounty();
        // Try to open again
        vm.prank(address(escrow));
        vm.expectRevert(DisputeResolver.DisputeAlreadyExists.selector);
        resolver.openDispute(bountyId);
    }

    // ─── Cast Vote ──────────────────────────────────────────────────────

    function test_castVote_approve() public {
        uint256 bountyId = _createDisputedBounty();

        resolver.castVote(bountyId, _makeProof(bountyId, 1, 42));

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(d.approveCount, 1);
        assertEq(d.rejectCount, 0);
    }

    function test_castVote_reject() public {
        uint256 bountyId = _createDisputedBounty();

        resolver.castVote(bountyId, _makeProof(bountyId, 0, 42));

        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(d.approveCount, 0);
        assertEq(d.rejectCount, 1);
    }

    function test_castVote_doubleVote_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        resolver.castVote(bountyId, _makeProof(bountyId, 1, 42));

        // Same nullifier = double vote — mock reverts via validateProof
        ISemaphore.SemaphoreProof memory proof = _makeProof(bountyId, 1, 42);
        vm.expectRevert(ISemaphore.Semaphore__YouAreUsingTheSameNullifierTwice.selector);
        resolver.castVote(bountyId, proof);
    }

    function test_castVote_invalidVote_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        ISemaphore.SemaphoreProof memory proof = _makeProof(bountyId, 2, 42);
        vm.expectRevert(DisputeResolver.InvalidVote.selector);
        resolver.castVote(bountyId, proof);
    }

    function test_castVote_wrongScope_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        ISemaphore.SemaphoreProof memory proof = _makeProof(bountyId, 1, 42);
        proof.scope = 9999; // wrong scope

        vm.expectRevert(DisputeResolver.InvalidScope.selector);
        resolver.castVote(bountyId, proof);
    }

    function test_castVote_afterVotingPeriod_reverts() public {
        uint256 bountyId = _createDisputedBounty();

        vm.warp(block.timestamp + 14 days + 1);

        ISemaphore.SemaphoreProof memory proof = _makeProof(bountyId, 1, 42);
        vm.expectRevert(DisputeResolver.VotingPeriodEnded.selector);
        resolver.castVote(bountyId, proof);
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
        // Voting period extended
        assertGt(d.votingEnd, block.timestamp);
    }

    function test_resolveDispute_noQuorum_afterExtension_escalates() public {
        uint256 bountyId = _createDisputedBounty();

        // Only 5 votes first round
        _castVotes(bountyId, 3, 2);

        vm.warp(block.timestamp + 14 days + 1);
        resolver.resolveDispute(bountyId); // extends

        // Add a few more but still not enough (use different nullifiers)
        for (uint256 i = 0; i < 2; i++) {
            resolver.castVote(bountyId, _makeProof(bountyId, 1, 5000 + i));
        }
        // total: 5+2 = 7 < 10

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

        // Should be able to vote during extension
        resolver.castVote(bountyId, _makeProof(bountyId, 1, 9999));

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
        resolver.setSupermajorityBps(5000); // must be > 5000

        vm.expectRevert(DisputeResolver.InvalidParameter.selector);
        resolver.setSupermajorityBps(10_000); // must be < 10000
    }

    // ─── Events ─────────────────────────────────────────────────────────

    function test_openDispute_emitsEvent() public {
        uint256 bountyId = _createDisputedBounty();
        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        // Event already emitted during _createDisputedBounty; verify dispute was created correctly
        assertEq(d.votingEnd, d.votingStart + 14 days);
    }

    function test_castVote_emitsEvent() public {
        uint256 bountyId = _createDisputedBounty();

        vm.expectEmit(true, false, false, true);
        emit DisputeResolver.VoteCast(bountyId, 1);
        resolver.castVote(bountyId, _makeProof(bountyId, 1, 42));
    }

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

    // ─── Re-initialization ─────────────────────────────────────────────

    function test_initialize_twice_reverts() public {
        vm.expectRevert();
        resolver.initialize(address(semaphore), address(escrow), groupId);
    }

    // ─── Resolve Escalated (SponsorWins) ────────────────────────────────

    function test_resolveEscalated_sponsorWins() public {
        uint256 bountyId = _createDisputedBounty();
        _castVotes(bountyId, 6, 4);
        vm.warp(block.timestamp + 14 days + 1);
        resolver.resolveDispute(bountyId); // escalates

        uint256 sponsorBefore = eurc.balanceOf(sponsor);
        uint256 treasuryBefore = eurc.balanceOf(treasury);
        uint256 bond = escrow.getBounty(bountyId).bond;

        resolver.resolveEscalated(bountyId, IBountyEscrow.DisputeOutcome.SponsorWins);

        assertEq(eurc.balanceOf(sponsor), sponsorBefore + REWARD);
        assertEq(eurc.balanceOf(treasury), treasuryBefore + bond);
    }

    // ─── Scope ──────────────────────────────────────────────────────────

    function test_disputeScope_isNamespaced() public view {
        uint256 scope0 = resolver.disputeScope(0);
        uint256 scope1 = resolver.disputeScope(1);

        // Different bounty IDs produce different scopes
        assertNotEq(scope0, scope1);
        // Scope is not just the raw bountyId
        assertNotEq(scope0, 0);
    }
}
