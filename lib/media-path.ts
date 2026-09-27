export function mediaId(cover:string){return /^\/images\/blog-([a-f0-9]{64})\.webp$/.exec(cover)?.[1];}
