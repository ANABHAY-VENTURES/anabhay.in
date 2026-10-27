// Exact ECMAScript TrimString code-point set, shared with migration 007.
export const releaseWhitespace=[0x0009,0x000a,0x000b,0x000c,0x000d,0x0020,0x00a0,0x1680,0x2000,0x2001,0x2002,0x2003,0x2004,0x2005,0x2006,0x2007,0x2008,0x2009,0x200a,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff];
const edge=new RegExp(`^[${String.fromCodePoint(...releaseWhitespace)}]+|[${String.fromCodePoint(...releaseWhitespace)}]+$`,'gu');
export function normalizeReleaseReason(value){
 if(typeof value!=='string')return null;
 const normalized=value.replace(edge,'');
 // PostgreSQL UTF-8 text cannot represent NUL or unpaired UTF-16 surrogates.
 if(normalized.includes('\0')||!normalized.isWellFormed())return null;
 const length=[...normalized].length;
 return length>=1&&length<=500?normalized:null;
}
