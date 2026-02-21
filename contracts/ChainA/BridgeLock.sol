// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract BridgeLock is AccessControl, Pausable {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    IERC20 public token;
    uint256 public nextNonce;
    mapping(uint256 => bool) public processedNonces;

    event Locked(address indexed user, uint256 amount, uint256 nonce);
    event Unlocked(address indexed user, uint256 amount, uint256 nonce);

    constructor(address _token, address _relayer) {
        token = IERC20(_token);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, _relayer);
        _grantRole(PAUSER_ROLE, msg.sender); // Allow admin to pause initially
    }

    function lock(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        token.transferFrom(msg.sender, address(this), amount);
        emit Locked(msg.sender, amount, nextNonce++);
    }

    function unlock(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(!processedNonces[nonce], "Nonce already processed");
        processedNonces[nonce] = true;
        token.transfer(user, amount);
        emit Unlocked(user, amount, nonce);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause(); 
    }
}
