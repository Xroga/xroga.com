/** Only public model setup may retry. Audio inference is never silently replayed. */
export function isVoiceDownloadFailure(error: unknown): boolean {
  return error instanceof Error && /fetch|network|connection|(?:HTTP|status(?: code)?)[:=]?\s*(?:408|429|5\d\d)/i.test(error.message);
}

export async function loadVoiceModel<T>(load:()=>Promise<T>,retry:()=>void):Promise<T> {
  for(let attempt=0; ; attempt++) {
    try{return await load();}
    catch(error){if(attempt!==0 || !isVoiceDownloadFailure(error))throw error;retry();}
  }
}
