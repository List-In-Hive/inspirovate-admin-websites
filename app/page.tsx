import Admin from "@/components/Admin";
import Link from "next/link";
import { hostedRuntime } from '@/lib/runtime';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { assertAdmin, AccessError } from '@/lib/admin-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (hostedRuntime()) {
    const requestHeaders = await headers();
    // A link from another site (chat, email, Railway) arrives as a cross-site navigation without the
    // SameSite=Strict session cookie. Reload from this page so the browser sends it as same-origin.
    if (requestHeaders.get('sec-fetch-site') === 'cross-site') {
      return <main style={{padding:40,fontFamily:'system-ui'}}><p>Opening the admin… <Link href="/">Continue</Link></p><script dangerouslySetInnerHTML={{__html:'location.replace(location.href)'}} /></main>;
    }
    try { assertAdmin(new Request('http://internal/', { headers: requestHeaders })); }
    catch (error) {
      if (error instanceof AccessError && error.status === 401) redirect('/login');
      return <main style={{padding:40,fontFamily:'system-ui'}}><h1>Admin unavailable</h1><p>Check the server access configuration.</p></main>;
    }
  }
  return <Admin hosted={hostedRuntime()} />;
}
