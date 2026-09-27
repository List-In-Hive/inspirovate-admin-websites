import Admin from "@/components/Admin";
import { hostedRuntime } from '@/lib/runtime';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { assertAdmin, AccessError } from '@/lib/admin-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (hostedRuntime()) {
    try { assertAdmin(new Request('http://internal/', { headers: await headers() })); }
    catch (error) {
      if (error instanceof AccessError && error.status === 401) redirect('/login');
      return <main style={{padding:40,fontFamily:'system-ui'}}><h1>Admin unavailable</h1><p>Check the server access configuration.</p></main>;
    }
  }
  return <Admin hosted={hostedRuntime()} />;
}
