// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IBridge {
    function pause() external;
    function unpause() external;
}

contract GovernanceEmergency is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    IBridge public bridge;

    event EmergencyActionTriggered(string action);

    constructor(address _bridge, address _relayer) {
        bridge = IBridge(_bridge);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    function pauseBridge() external onlyRole(RELAYER_ROLE) {
        bridge.pause();
        emit EmergencyActionTriggered("PAUSE");
    }
}
