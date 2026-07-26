// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MilestoneEscrow {
    enum State { Funded, Released, Refunded }

    address public immutable payer;
    address public immutable beneficiary;
    address public immutable arbiter;
    uint256 public immutable fundedAmount;
    State public state;
    bool private locked;

    event Released(address indexed beneficiary, uint256 amount);
    event Refunded(address indexed payer, uint256 amount);

    modifier nonReentrant() {
        require(!locked, "reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor(address _beneficiary, address _arbiter) payable {
        require(msg.value > 0, "funding required");
        require(_beneficiary != address(0) && _arbiter != address(0), "invalid actor");
        payer = msg.sender;
        beneficiary = _beneficiary;
        arbiter = _arbiter;
        fundedAmount = msg.value;
    }

    function release() external nonReentrant {
        require(msg.sender == payer || msg.sender == arbiter, "release denied");
        require(state == State.Funded, "escrow closed");
        state = State.Released;
        (bool ok,) = beneficiary.call{value: address(this).balance}("");
        require(ok, "release failed");
    }

    function refund() external nonReentrant {
        require(msg.sender == beneficiary || msg.sender == arbiter, "refund denied");
        require(state == State.Funded, "escrow closed");
        state = State.Refunded;
        (bool ok,) = payer.call{value: address(this).balance}("");
        require(ok, "refund failed");
    }
}
