export function githubRepository(input:string) {
 let url:URL;try{url=new URL(input.trim());}catch{throw new Error('Enter a GitHub repository link, for example https://github.com/owner/website.');}
 const match=url.pathname.match(/^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
 if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash||!match||['.','..'].includes(match[2]))throw new Error('Use the main HTTPS link to a github.com repository.');
 return `${match[1]}/${match[2]}`;
}
export function publicWebsite(input:string) {
 let u:URL;try{u=new URL(input);}catch{throw new Error('Enter the public website HTTPS address.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!u.hostname.includes('.')||/[:\[\]]/.test(u.hostname)||/^\d+(\.\d+){3}$/.test(u.hostname)||/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(u.hostname)||u.hostname==='example.com')throw new Error('Use a public HTTPS website origin, without a path or credentials.');
 return u.origin;
}
