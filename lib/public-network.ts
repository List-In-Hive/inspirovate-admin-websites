import { lookup } from 'node:dns/promises';
import { isIP,BlockList } from 'node:net';
import { publicWebsite } from './repository-input';
const blocked=new BlockList();
for(const [network,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(network,bits,'ipv4');
export function publicAddress(address:string){
 if(isIP(address)===4)return !blocked.check(address,'ipv4');
 // Only global-unicast IPv6 addresses, never loopback, mapped IPv4 or local networks.
 return isIP(address)===6&&/^[23][a-f0-9]{3}:/i.test(address);
}
export async function assertPublicWebsiteNetwork(url:string){
 const origin=publicWebsite(url);const records=await lookup(new URL(origin).hostname,{all:true});
 if(!records.length||records.some(r=>!publicAddress(r.address)))throw new Error('The website must resolve to a public internet address.');
}
