// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/BountyEscrow.sol";
import "../src/DisputeResolver.sol";
import "../src/interfaces/IBountyEscrow.sol";
import "./mocks/MockEURC.sol";
import "./mocks/MockSemaphore.sol";

contract BountyEscrowTest is Test {
    BountyEscrow public escrow;
    DisputeResolver public resolver;
    MockEURC public eurc;
    MockSemaphore public semaphore;

    address public owner = address(this);
    address public sponsor = makeAddr("sponsor");
    address public dev = makeAddr("dev");
    address public treasury = makeAddr("treasury");
    address public anyone = makeAddr("anyone");

    uint256 public constant REWARD = 2000e6; // 2000 EURC
    uint256 public constant BOND_BPS = 500; // 5%
    uint256 public constant BOND = REWARD * BOND_BPS / 10_000; // 100 EURC
    bytes32 public constant DESC_HASH = keccak256("Osu! beatmap request system");

    function setUp() public {
        eurc = new MockEURC();
        semaphore = new MockSemaphore();

        // Deploy escrow behind proxy
        BountyEscrow escrowImpl = new BountyEscrow();
        ERC1967Proxy escrowProxy =
            new ERC1967Proxy(address(escrowImpl), abi.encodeCall(BountyEscrow.initialize, (address(eurc), treasury)));
        escrow = BountyEscrow(address(escrowProxy));

        // Deploy dispute resolver behind proxy
        address[] memory notaries = new address[](0);
        DisputeResolver resolverImpl = new DisputeResolver();
        ERC1967Proxy resolverProxy = new ERC1967Proxy(
            address(resolverImpl),
            abi.encodeCall(
                DisputeResolver.initialize,
                (address(semaphore), address(escrow), notaries, 0, "gql.twitch.tv")
            )
        );
        resolver = DisputeResolver(address(resolverProxy));

        // Wire escrow to resolver
        escrow.setDisputeResolver(address(resolver));

        // Fund sponsor and dev with EURC
        eurc.mint(sponsor, 100_000e6);
        eurc.mint(dev, 100_000e6);

        // Approve escrow to spend tokens
        vm.prank(sponsor);
        eurc.approve(address(escrow), type(uint256).max);
        vm.prank(dev);
        eurc.approve(address(escrow), type(uint256).max);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _createBounty() internal returns (uint256) {
        vm.prank(sponsor);
        return escrow.createBounty(DESC_HASH, 30 days, REWARD);
    }

    function _createAndActivate() internal returns (uint256) {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);
        vm.prank(dev);
        escrow.stakeBond(bountyId);
        return bountyId;
    }

    function _createActivateAndSubmit() internal returns (uint256) {
        uint256 bountyId = _createAndActivate();
        vm.prank(dev);
        escrow.submitDeliverable(bountyId, "https://github.com/dev/project");
        return bountyId;
    }

    // ─── Create Bounty ──────────────────────────────────────────────────

    function test_createBounty() public {
        uint256 sponsorBefore = eurc.balanceOf(sponsor);

        uint256 bountyId = _createBounty();

        assertEq(bountyId, 0);
        assertEq(eurc.balanceOf(address(escrow)), REWARD);
        assertEq(eurc.balanceOf(sponsor), sponsorBefore - REWARD);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(b.sponsor, sponsor);
        assertEq(b.reward, REWARD);
        assertEq(b.descriptionHash, DESC_HASH);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Open));
    }

    function test_createBounty_zeroReward_reverts() public {
        vm.prank(sponsor);
        vm.expectRevert(BountyEscrow.RewardTooLow.selector);
        escrow.createBounty(DESC_HASH, 30 days, 0);
    }

    function test_createBounty_belowMinimum_reverts() public {
        vm.prank(sponsor);
        vm.expectRevert(BountyEscrow.RewardTooLow.selector);
        escrow.createBounty(DESC_HASH, 30 days, 999_999); // just under 1 EURC
    }

    function test_createBounty_durationTooShort_reverts() public {
        vm.prank(sponsor);
        vm.expectRevert(BountyEscrow.DeadlineTooShort.selector);
        escrow.createBounty(DESC_HASH, 1 hours, REWARD); // less than 1 day
    }

    function test_createBounty_durationExactlyOneDay() public {
        vm.prank(sponsor);
        uint256 bountyId = escrow.createBounty(DESC_HASH, 1 days, REWARD);
        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(b.deadline, 1 days);
    }

    function test_createBounty_incrementsId() public {
        uint256 id0 = _createBounty();
        uint256 id1 = _createBounty();
        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    // ─── Cancel Bounty ──────────────────────────────────────────────────

    function test_cancelBounty() public {
        uint256 bountyId = _createBounty();
        uint256 sponsorBefore = eurc.balanceOf(sponsor);

        vm.prank(sponsor);
        escrow.cancelBounty(bountyId);

        assertEq(eurc.balanceOf(sponsor), sponsorBefore + REWARD);
        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Cancelled));
    }

    function test_cancelBounty_afterDevApproved_beforeStake() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        // Sponsor can still cancel since dev hasn't staked
        vm.prank(sponsor);
        escrow.cancelBounty(bountyId);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Cancelled));
    }

    function test_cancelBounty_notSponsor_reverts() public {
        uint256 bountyId = _createBounty();
        vm.prank(dev);
        vm.expectRevert(BountyEscrow.NotSponsor.selector);
        escrow.cancelBounty(bountyId);
    }

    function test_cancelBounty_afterActive_reverts() public {
        uint256 bountyId = _createAndActivate();
        vm.prank(sponsor);
        vm.expectRevert();
        escrow.cancelBounty(bountyId);
    }

    // ─── Approve Dev ────────────────────────────────────────────────────

    function test_approveDev() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(b.dev, dev);
        assertEq(b.bond, BOND);
        assertEq(b.bondStakeDeadline, block.timestamp + 3 days);
    }

    function test_approveDev_replacePendingDev() public {
        uint256 bountyId = _createBounty();
        address dev2 = makeAddr("dev2");

        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        // Can't replace before window expires
        vm.prank(sponsor);
        vm.expectRevert(BountyEscrow.BondStakeWindowNotExpired.selector);
        escrow.approveDev(bountyId, dev2);

        // Warp past window
        vm.warp(block.timestamp + 3 days + 1);

        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev2);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(b.dev, dev2);
    }

    function test_approveDev_zeroAddress_reverts() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        vm.expectRevert(BountyEscrow.ZeroAddress.selector);
        escrow.approveDev(bountyId, address(0));
    }

    // ─── Stake Bond ─────────────────────────────────────────────────────

    function test_stakeBond() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        uint256 devBefore = eurc.balanceOf(dev);
        vm.prank(dev);
        escrow.stakeBond(bountyId);

        assertEq(eurc.balanceOf(dev), devBefore - BOND);
        assertEq(eurc.balanceOf(address(escrow)), REWARD + BOND);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Active));
    }

    function test_stakeBond_afterWindowExpires_reverts() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        vm.warp(block.timestamp + 3 days + 1);

        vm.prank(dev);
        vm.expectRevert(BountyEscrow.BondStakeWindowExpired.selector);
        escrow.stakeBond(bountyId);
    }

    function test_stakeBond_notDev_reverts() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        vm.prank(anyone);
        vm.expectRevert(BountyEscrow.NotDev.selector);
        escrow.stakeBond(bountyId);
    }

    function test_stakeBond_setsDeadlineFromNow() public {
        uint256 bountyId = _createBounty();

        // Before staking, deadline holds the raw duration
        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(b.deadline, 30 days);

        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        // Warp 2 days (simulating dev taking time to stake, within 3-day window)
        vm.warp(block.timestamp + 2 days);
        uint256 stakeTime = block.timestamp;

        vm.prank(dev);
        escrow.stakeBond(bountyId);

        // After staking, deadline is absolute: stakeTime + 30 days
        b = escrow.getBounty(bountyId);
        assertEq(b.deadline, stakeTime + 30 days);
    }

    // ─── Submit Deliverable ─────────────────────────────────────────────

    function test_submitDeliverable() public {
        uint256 bountyId = _createAndActivate();

        vm.prank(dev);
        escrow.submitDeliverable(bountyId, "ipfs://QmTest");

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Submitted));
        assertEq(b.submissionTime, block.timestamp);
        assertEq(b.proofURIHash, keccak256(bytes("ipfs://QmTest")));
    }

    function test_submitDeliverable_afterDeadline_reverts() public {
        uint256 bountyId = _createAndActivate();

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        vm.warp(b.deadline + 1);

        vm.prank(dev);
        vm.expectRevert(BountyEscrow.DeadlinePassed.selector);
        escrow.submitDeliverable(bountyId, "ipfs://QmTest");
    }

    // ─── Approve Deliverable (Happy Path) ───────────────────────────────

    function test_approveDeliverable() public {
        uint256 bountyId = _createActivateAndSubmit();

        uint256 devBefore = eurc.balanceOf(dev);

        vm.prank(sponsor);
        escrow.approveDeliverable(bountyId);

        assertEq(eurc.balanceOf(dev), devBefore + REWARD + BOND);
        assertEq(eurc.balanceOf(address(escrow)), 0);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Approved));
    }

    // ─── Reject Deliverable ─────────────────────────────────────────────

    function test_rejectDeliverable_opensDispute() public {
        uint256 bountyId = _createActivateAndSubmit();

        vm.prank(sponsor);
        escrow.rejectDeliverable(bountyId);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Disputed));

        // Dispute should be created in resolver
        DisputeResolver.Dispute memory d = resolver.getDispute(bountyId);
        assertEq(uint8(d.status), uint8(DisputeResolver.DisputeStatus.Voting));
    }

    function test_rejectDeliverable_afterReviewWindow_reverts() public {
        uint256 bountyId = _createActivateAndSubmit();

        vm.warp(block.timestamp + 14 days + 1);

        vm.prank(sponsor);
        vm.expectRevert(BountyEscrow.ReviewWindowExpired.selector);
        escrow.rejectDeliverable(bountyId);
    }

    // ─── Claim On Timeout ───────────────────────────────────────────────

    function test_claimOnTimeout() public {
        uint256 bountyId = _createAndActivate();

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        vm.warp(b.deadline + 1);

        uint256 sponsorBefore = eurc.balanceOf(sponsor);
        uint256 treasuryBefore = eurc.balanceOf(treasury);

        vm.prank(anyone); // anyone can call
        escrow.claimOnTimeout(bountyId);

        assertEq(eurc.balanceOf(sponsor), sponsorBefore + REWARD);
        assertEq(eurc.balanceOf(treasury), treasuryBefore + BOND);

        b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Expired));
    }

    function test_claimOnTimeout_beforeDeadline_reverts() public {
        uint256 bountyId = _createAndActivate();

        vm.prank(sponsor);
        vm.expectRevert(BountyEscrow.DeadlineNotPassed.selector);
        escrow.claimOnTimeout(bountyId);
    }

    // ─── Claim On Expired Review ────────────────────────────────────────

    function test_claimOnExpiredReview() public {
        uint256 bountyId = _createActivateAndSubmit();

        vm.warp(block.timestamp + 14 days + 1);

        uint256 devBefore = eurc.balanceOf(dev);

        vm.prank(dev);
        escrow.claimOnExpiredReview(bountyId);

        assertEq(eurc.balanceOf(dev), devBefore + REWARD + BOND);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Approved));
    }

    function test_claimOnExpiredReview_beforeExpiry_reverts() public {
        uint256 bountyId = _createActivateAndSubmit();

        vm.prank(dev);
        vm.expectRevert(BountyEscrow.ReviewWindowNotExpired.selector);
        escrow.claimOnExpiredReview(bountyId);
    }

    function test_claimOnExpiredReview_notDev_reverts() public {
        uint256 bountyId = _createActivateAndSubmit();
        vm.warp(block.timestamp + 14 days + 1);

        vm.prank(anyone);
        vm.expectRevert(BountyEscrow.NotDev.selector);
        escrow.claimOnExpiredReview(bountyId);
    }

    // ─── Dispute Resolution Callback ────────────────────────────────────

    function test_resolveDispute_devWins() public {
        uint256 bountyId = _createActivateAndSubmit();

        vm.prank(sponsor);
        escrow.rejectDeliverable(bountyId);

        uint256 devBefore = eurc.balanceOf(dev);

        // Simulate resolver calling back
        vm.prank(address(resolver));
        escrow.resolveDispute(bountyId, IBountyEscrow.DisputeOutcome.DevWins);

        assertEq(eurc.balanceOf(dev), devBefore + REWARD + BOND);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(BountyEscrow.BountyStatus.Resolved));
    }

    function test_resolveDispute_sponsorWins() public {
        uint256 bountyId = _createActivateAndSubmit();

        vm.prank(sponsor);
        escrow.rejectDeliverable(bountyId);

        uint256 sponsorBefore = eurc.balanceOf(sponsor);
        uint256 treasuryBefore = eurc.balanceOf(treasury);

        vm.prank(address(resolver));
        escrow.resolveDispute(bountyId, IBountyEscrow.DisputeOutcome.SponsorWins);

        assertEq(eurc.balanceOf(sponsor), sponsorBefore + REWARD);
        assertEq(eurc.balanceOf(treasury), treasuryBefore + BOND);
    }

    function test_resolveDispute_notResolver_reverts() public {
        uint256 bountyId = _createActivateAndSubmit();
        vm.prank(sponsor);
        escrow.rejectDeliverable(bountyId);

        vm.prank(anyone);
        vm.expectRevert(BountyEscrow.NotDisputeResolver.selector);
        escrow.resolveDispute(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function test_setBondPercentageBps_outOfRange_reverts() public {
        vm.expectRevert(BountyEscrow.InvalidParameter.selector);
        escrow.setBondPercentageBps(0);

        vm.expectRevert(BountyEscrow.InvalidParameter.selector);
        escrow.setBondPercentageBps(5001);
    }

    function test_setReviewWindow_tooShort_reverts() public {
        vm.expectRevert(BountyEscrow.InvalidParameter.selector);
        escrow.setReviewWindow(1 hours);
    }

    function test_admin_notOwner_reverts() public {
        vm.prank(anyone);
        vm.expectRevert();
        escrow.setTreasury(anyone);
    }

    // ─── Events ─────────────────────────────────────────────────────────

    function test_createBounty_emitsEvent() public {
        vm.prank(sponsor);
        vm.expectEmit(true, true, false, true);
        emit BountyEscrow.BountyCreated(0, sponsor, REWARD, 30 days);
        escrow.createBounty(DESC_HASH, 30 days, REWARD);
    }

    function test_cancelBounty_emitsEvent() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        vm.expectEmit(true, false, false, false);
        emit BountyEscrow.BountyCancelled(bountyId);
        escrow.cancelBounty(bountyId);
    }

    function test_approveDev_emitsEvent() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        vm.expectEmit(true, true, false, true);
        emit BountyEscrow.DevApproved(bountyId, dev, block.timestamp + 3 days);
        escrow.approveDev(bountyId, dev);
    }

    function test_stakeBond_emitsEvent() public {
        uint256 bountyId = _createBounty();
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        vm.prank(dev);
        vm.expectEmit(true, true, false, true);
        emit BountyEscrow.BondStaked(bountyId, dev, BOND);
        escrow.stakeBond(bountyId);
    }

    function test_submitDeliverable_emitsEvent() public {
        uint256 bountyId = _createAndActivate();
        vm.prank(dev);
        vm.expectEmit(true, false, false, true);
        emit BountyEscrow.DeliverableSubmitted(bountyId, "ipfs://QmTest");
        escrow.submitDeliverable(bountyId, "ipfs://QmTest");
    }

    function test_approveDeliverable_emitsEvent() public {
        uint256 bountyId = _createActivateAndSubmit();
        vm.prank(sponsor);
        vm.expectEmit(true, false, false, false);
        emit BountyEscrow.DeliverableApproved(bountyId);
        escrow.approveDeliverable(bountyId);
    }

    function test_rejectDeliverable_emitsEvent() public {
        uint256 bountyId = _createActivateAndSubmit();
        vm.prank(sponsor);
        vm.expectEmit(true, false, false, false);
        emit BountyEscrow.DeliverableRejected(bountyId);
        escrow.rejectDeliverable(bountyId);
    }

    function test_claimOnTimeout_emitsEvent() public {
        uint256 bountyId = _createAndActivate();
        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        vm.warp(b.deadline + 1);

        vm.expectEmit(true, false, false, false);
        emit BountyEscrow.BountyExpired(bountyId);
        escrow.claimOnTimeout(bountyId);
    }

    function test_resolveDispute_emitsEvent() public {
        uint256 bountyId = _createActivateAndSubmit();
        vm.prank(sponsor);
        escrow.rejectDeliverable(bountyId);

        vm.prank(address(resolver));
        vm.expectEmit(true, false, false, true);
        emit BountyEscrow.BountyResolved(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
        escrow.resolveDispute(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
    }

    // ─── UUPS Upgrade ──────────────────────────────────────────────────

    function test_upgrade_asOwner() public {
        BountyEscrow newImpl = new BountyEscrow();
        escrow.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_notOwner_reverts() public {
        BountyEscrow newImpl = new BountyEscrow();
        vm.prank(anyone);
        vm.expectRevert();
        escrow.upgradeToAndCall(address(newImpl), "");
    }

    // ─── Re-initialization ─────────────────────────────────────────────

    function test_initialize_twice_reverts() public {
        vm.expectRevert();
        escrow.initialize(address(eurc), treasury);
    }

    // ─── Zero Bond Edge Case ───────────────────────────────────────────

    function test_minimumReward_exactlyOneEurc() public {
        // 1 EURC = 1e6 base units, minimum allowed
        uint256 minReward = 1e6;
        eurc.mint(sponsor, minReward);
        vm.prank(sponsor);
        uint256 bountyId = escrow.createBounty(DESC_HASH, 30 days, minReward);

        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        BountyEscrow.Bounty memory b = escrow.getBounty(bountyId);
        // 1e6 * 500 / 10000 = 50000 (0.05 EURC)
        assertEq(b.bond, 50_000);

        vm.prank(dev);
        escrow.stakeBond(bountyId);

        vm.prank(dev);
        escrow.submitDeliverable(bountyId, "proof");
        vm.prank(sponsor);
        escrow.approveDeliverable(bountyId);

        assertEq(eurc.balanceOf(address(escrow)), 0);
    }

    // ─── Full Happy Path ────────────────────────────────────────────────

    function test_fullHappyPath() public {
        uint256 sponsorBefore = eurc.balanceOf(sponsor);
        uint256 devBefore = eurc.balanceOf(dev);

        // 1. Create bounty
        uint256 bountyId = _createBounty();
        assertEq(eurc.balanceOf(sponsor), sponsorBefore - REWARD);

        // 2. Approve dev
        vm.prank(sponsor);
        escrow.approveDev(bountyId, dev);

        // 3. Stake bond
        vm.prank(dev);
        escrow.stakeBond(bountyId);
        assertEq(eurc.balanceOf(dev), devBefore - BOND);

        // 4. Submit deliverable
        vm.warp(block.timestamp + 14 days);
        vm.prank(dev);
        escrow.submitDeliverable(bountyId, "https://github.com/dev/project");

        // 5. Approve deliverable
        vm.prank(sponsor);
        escrow.approveDeliverable(bountyId);

        // Dev gets reward + bond back
        assertEq(eurc.balanceOf(dev), devBefore - BOND + REWARD + BOND);
        assertEq(eurc.balanceOf(dev), devBefore + REWARD);
        assertEq(eurc.balanceOf(address(escrow)), 0);
    }
}
