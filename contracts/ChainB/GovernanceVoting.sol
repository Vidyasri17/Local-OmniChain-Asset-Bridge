// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GovernanceVoting is Ownable {
    IERC20 public token;
    uint256 public proposalCount;
    
    struct Proposal {
        uint256 id;
        string description;
        uint256 voteCount;
        bool executed;
        mapping(address => bool) hasVoted;
    }
    
    mapping(uint256 => Proposal) public proposals;
    
    event ProposalCreated(uint256 id, string description);
    event Voted(uint256 id, address voter);
    event ProposalPassed(uint256 proposalId, bytes data);

    constructor(address _token) Ownable(msg.sender) {
        token = IERC20(_token);
    }

    function createProposal(string memory description) external {
        proposalCount++;
        Proposal storage p = proposals[proposalCount];
        p.id = proposalCount;
        p.description = description;
        emit ProposalCreated(proposalCount, description);
    }

    function vote(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "Proposal does not exist");
        require(!p.hasVoted[msg.sender], "Already voted");
        require(!p.executed, "Already executed");
        uint256 balance = token.balanceOf(msg.sender);
        require(balance > 0, "Must hold tokens");

        p.hasVoted[msg.sender] = true;
        p.voteCount += balance;
        
        emit Voted(proposalId, msg.sender);

        // Simple threshold: > 50% of supply? Or just a fixed amount to make it testable?
        // Let's use a small threshold for testing purposes, e.g. 50 tokens.
        if (p.voteCount > 50 * 10**18) {
            p.executed = true;
            emit ProposalPassed(proposalId, bytes("PAUSE"));
        }
    }
}
