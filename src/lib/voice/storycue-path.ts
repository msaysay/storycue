export const STORYCUE_BASE_PATH=process.env.NEXT_PUBLIC_STORYCUE_BASE_PATH || "";
export function storycuePath(path:string):string{return STORYCUE_BASE_PATH+path;}
