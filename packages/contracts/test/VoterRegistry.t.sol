// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/VoterRegistry.sol";
import "../src/interfaces/IReclaim.sol";
import "./mocks/MockSemaphore.sol";
import "./mocks/MockReclaim.sol";

contract VoterRegistryTest is Test {
    VoterRegistry public registry;
    MockSemaphore public semaphore;
    MockReclaim public reclaim;

    string public constant USER_ID_FIELD = '"userId":"';
    string public constant PROVIDER_ID = "twitch-sub-provider";

    function setUp() public {
        semaphore = new MockSemaphore();
        reclaim = new MockReclaim();

        VoterRegistry impl = new VoterRegistry();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(VoterRegistry.initialize, (address(semaphore), address(reclaim), USER_ID_FIELD, PROVIDER_ID))
        );
        registry = VoterRegistry(address(proxy));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _makeProof(string memory userId) internal view returns (IReclaim.Proof memory) {
        string memory context = string(abi.encodePacked('{"userId":"', userId, '","channel":"neuro-sama"}'));

        Claims.ClaimInfo memory claimInfo = Claims.ClaimInfo({
            provider: PROVIDER_ID,
            parameters: '{"channel":"neuro-sama"}',
            context: context
        });

        Claims.CompleteClaimData memory claimData = Claims.CompleteClaimData({
            identifier: bytes32(0),
            owner: address(0),
            timestampS: uint32(block.timestamp),
            epoch: 1
        });

        bytes[] memory sigs = new bytes[](0);
        Claims.SignedClaim memory signedClaim = Claims.SignedClaim({claim: claimData, signatures: sigs});

        return IReclaim.Proof({claimInfo: claimInfo, signedClaim: signedClaim});
    }

    // ─── Initialize ─────────────────────────────────────────────────────

    function test_initialize() public view {
        assertEq(registry.reclaimAddress(), address(reclaim));
        assertEq(registry.getGroupId(), 0); // first group created
        assertEq(registry.userIdFieldTarget(), USER_ID_FIELD);
        assertEq(registry.expectedProvider(), PROVIDER_ID);
    }

    function test_initialize_createsGroup() public view {
        // Registry should be the group admin
        uint256 gid = registry.getGroupId();
        assertEq(semaphore.getGroupAdmin(gid), address(registry));
    }

    // ─── Register Voter ─────────────────────────────────────────────────

    function test_registerVoter() public {
        uint256 commitment = 12345;

        registry.registerVoter(_makeProof("user_123"), commitment);

        // Check member was added to Semaphore group
        uint256[] memory members = semaphore.getGroupMembers(registry.getGroupId());
        assertEq(members.length, 1);
        assertEq(members[0], commitment);

        // Check user hash is registered
        bytes32 userHash = keccak256(abi.encodePacked("user_123"));
        assertTrue(registry.isRegistered(userHash));
    }

    function test_registerVoter_multipleUsers() public {
        registry.registerVoter(_makeProof("user_1"), 111);
        registry.registerVoter(_makeProof("user_2"), 222);
        registry.registerVoter(_makeProof("user_3"), 333);

        uint256[] memory members = semaphore.getGroupMembers(registry.getGroupId());
        assertEq(members.length, 3);
    }

    function test_registerVoter_sameUser_reverts() public {
        registry.registerVoter(_makeProof("user_123"), 111);

        // Same user ID, different commitment — should still revert
        vm.expectRevert(VoterRegistry.AlreadyRegistered.selector);
        registry.registerVoter(_makeProof("user_123"), 222);
    }

    function test_registerVoter_zeroCommitment_reverts() public {
        vm.expectRevert(VoterRegistry.ZeroCommitment.selector);
        registry.registerVoter(_makeProof("user_123"), 0);
    }

    function test_registerVoter_invalidProof_reverts() public {
        reclaim.setShouldReject(true);

        vm.expectRevert("MockReclaim: proof rejected");
        registry.registerVoter(_makeProof("user_123"), 12345);
    }

    function test_registerVoter_wrongProvider_reverts() public {
        IReclaim.Proof memory proof = _makeProof("user_123");
        proof.claimInfo.provider = "wrong-provider";

        vm.expectRevert(VoterRegistry.InvalidProvider.selector);
        registry.registerVoter(proof, 12345);
    }

    // ─── Duplicate Commitment ──────────────────────────────────────────

    function test_registerVoter_duplicateCommitment_reverts() public {
        uint256 commitment = 12345;

        registry.registerVoter(_makeProof("user_1"), commitment);

        // Different user, same commitment
        vm.expectRevert(VoterRegistry.DuplicateCommitment.selector);
        registry.registerVoter(_makeProof("user_2"), commitment);
    }

    // ─── Events ─────────────────────────────────────────────────────────

    function test_registerVoter_emitsEvent() public {
        uint256 commitment = 12345;
        bytes32 expectedHash = keccak256(abi.encodePacked("user_123"));

        vm.expectEmit(true, false, false, true);
        emit VoterRegistry.VoterRegistered(expectedHash, commitment);
        registry.registerVoter(_makeProof("user_123"), commitment);
    }

    // ─── UUPS Upgrade ──────────────────────────────────────────────────

    function test_upgrade_asOwner() public {
        VoterRegistry newImpl = new VoterRegistry();
        registry.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_notOwner_reverts() public {
        VoterRegistry newImpl = new VoterRegistry();
        vm.prank(makeAddr("anyone"));
        vm.expectRevert();
        registry.upgradeToAndCall(address(newImpl), "");
    }

    // ─── Re-initialization ─────────────────────────────────────────────

    function test_initialize_twice_reverts() public {
        vm.expectRevert();
        registry.initialize(address(semaphore), address(reclaim), USER_ID_FIELD, PROVIDER_ID);
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function test_setExpectedProvider() public {
        registry.setExpectedProvider("discord-role-provider");
        assertEq(registry.expectedProvider(), "discord-role-provider");
    }

    function test_setReclaimAddress_zeroAddress_reverts() public {
        vm.expectRevert(VoterRegistry.ZeroAddress.selector);
        registry.setReclaimAddress(address(0));
    }

    function test_admin_notOwner_reverts() public {
        vm.prank(makeAddr("anyone"));
        vm.expectRevert();
        registry.setExpectedProvider("hacked");
    }
}
