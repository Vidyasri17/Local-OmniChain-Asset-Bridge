// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IWrappedToken {
    function mint(address to, uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;
}

contract BridgeMint is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    IWrappedToken public token;
    uint256 public nextNonce;
    mapping(uint256 => bool) public processedNonces;

    event Burned(address indexed user, uint256 amount, uint256 nonce);
    event Minted(address indexed user, uint256 amount, uint256 nonce);

    constructor(address _token, address _relayer) {
        token = IWrappedToken(_token);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    function mintWrapped(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) {
        require(!processedNonces[nonce], "Nonce already processed");
        processedNonces[nonce] = true;
        token.mint(user, amount);
        emit Minted(user, amount, nonce);
    }
    
    function burn(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        token.burnFrom(msg.sender, amount);
        emit Burned(msg.sender, amount, nextNonce++);
    }
}
