/** Retained API surface for historical imports. No new Gemini execution. */
export async function geminiGenerate(_system:string,_user:string,_options?:{model?:string;maxTokens?:number;apiKey?:string}):Promise<string>{
  throw Object.assign(new Error('This generative provider is retired. Use the canonical admitted model path.'), {code:'MODEL_DESTINATION_DENIED',status:400});
}
export async function geminiFactCheck(_claims:string[],_sources:string[]):Promise<string>{
  throw Object.assign(new Error('This generative provider is retired. Use the canonical admitted model path.'), {code:'MODEL_DESTINATION_DENIED',status:400});
}
