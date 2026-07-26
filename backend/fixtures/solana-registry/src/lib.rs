use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let mut accounts = accounts.iter();
    let authority = next_account_info(&mut accounts)?;
    let record = next_account_info(&mut accounts)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let (expected, _) = Pubkey::find_program_address(
        &[b"record", authority.key.as_ref()],
        program_id,
    );
    if expected != *record.key || data.len() != 32 {
        return Err(ProgramError::InvalidSeeds);
    }
    record.try_borrow_mut_data()?[..32].copy_from_slice(data);
    Ok(())
}
