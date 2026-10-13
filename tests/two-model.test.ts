import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createAIContent, withFallback, contentModels } from '../lib/openai';
import { defaultProfile } from '../lib/profile';

const brief={readerQuestion:'How do I keep desk flowers fresh?',searchIntent:'informational',primaryKeyword:'keep desk flowers fresh',secondaryKeywords:['desk vase care'],titleIdeas:['How to keep desk flowers fresh'],outline:[{heading:'Change the water',points:['Every two days']}],facts:[],internalLinkIdeas:[],notes:''};
const article={title:'How to keep desk flowers fresh',slug:'keep-desk-flowers-fresh',description:'Simple care steps.',body:'Intro\n\n## Change the water\n\nUseful text.'};
const openAIResponse=(value:unknown,id:string)=>new Response(JSON.stringify({id,object:'response',created_at:1,status:'completed',model:'test',output:[{type:'message',id:'msg',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(value),annotations:[]}]}],usage:{input_tokens:10,output_tokens:20,total_tokens:30}}),{status:200,headers:{'content-type':'application/json'}});
function claudeStream(value:unknown,id:string){
 const events=[
  ['message_start',{type:'message_start',message:{id,type:'message',role:'assistant',model:'claude-opus-5-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:0}}}],
  ['content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}],
  ['content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:JSON.stringify(value)}}],
  ['content_block_stop',{type:'content_block_stop',index:0}],
  ['message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:7}}],
  ['message_stop',{type:'message_stop'}],
 ];
 return new Response(events.map(([name,data])=>`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join(''),{status:200,headers:{'content-type':'text/event-stream'}});
}
async function withKeys(work:()=>Promise<void>){
 const before={fetch:globalThis.fetch,openai:process.env.OPENAI_API_KEY,claude:process.env.ANTHROPIC_API_KEY};
 process.env.OPENAI_API_KEY='test-openai';process.env.ANTHROPIC_API_KEY='test-claude';
 try{await work();}finally{
  globalThis.fetch=before.fetch;
  if(before.openai===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before.openai;
  if(before.claude===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=before.claude;
 }
}
const profile={...defaultProfile,externalLinkCount:0,internalLinkCount:0};

test('OpenAI researches the brief and Claude writes the article from it',()=>withKeys(async()=>{
 const calls:{url:string;body:Record<string,unknown>;headers:Headers}[]=[];
 globalThis.fetch=async(input,init)=>{
  const url=String(input);calls.push({url,body:JSON.parse(String(init?.body)),headers:new Headers(init?.headers)});
  if(url.startsWith('https://api.openai.com/v1/responses'))return openAIResponse(brief,'resp_brief');
  if(url.startsWith('https://api.anthropic.com/v1/messages'))return claudeStream(article,'msg_article');
  throw new Error(`Unexpected request ${url}`);
 };
 const result=await createAIContent('Desk flowers',profile,[]);
 assert.deepEqual(calls.map(c=>new URL(c.url).hostname),['api.openai.com','api.anthropic.com']);
 const claude=calls[1];
 assert.equal(claude.body.model,'claude-opus-5-5');assert.equal(claude.body.fallbacks,'default');
 assert.ok(claude.headers.get('anthropic-beta')?.includes('server-side-fallback-2026-07-01'));
 assert.equal((claude.body.output_config as {format:{type:string}}).format.type,'json_schema');
 assert.ok(JSON.stringify(claude.body.messages).includes(brief.primaryKeyword),'Claude receives the brief');
 assert.equal(result.output.slug,article.slug);assert.equal(result.responseId,'resp_brief,msg_article');
 assert.equal(result.inputTokens,15);assert.equal(result.outputTokens,27);
 assert.equal(contentModels(),'gpt-5.6-terra + claude-opus-5-5');
}));

test('a Claude outage hands writing to OpenAI; without a Claude key OpenAI writes alone',()=>withKeys(async()=>{
 const hosts:string[]=[];let openai=0;
 globalThis.fetch=async(input)=>{
  const url=String(input);hosts.push(new URL(url).hostname);
  if(url.startsWith('https://api.anthropic.com'))return new Response(JSON.stringify({type:'error',error:{type:'overloaded_error',message:'Overloaded'}}),{status:529,headers:{'content-type':'application/json'}});
  return openAIResponse(openai++===0?brief:article,`resp_${openai}`);
 };
 const result=await createAIContent('Desk flowers',profile,[]);
 assert.deepEqual(hosts,['api.openai.com','api.anthropic.com','api.openai.com']);assert.equal(result.output.title,article.title);
 delete process.env.ANTHROPIC_API_KEY;hosts.length=0;openai=1;
 await createAIContent('Desk flowers',profile,[]);
 assert.deepEqual(hosts,['api.openai.com']);assert.equal(contentModels(),'gpt-5.6-terra');
}));

test('ambiguous timeouts and invalid requests are never handed to the other paid provider',()=>withKeys(async()=>{
 let second=0;const other=async()=>{second++;return 'other';};
 await assert.rejects(()=>withFallback('claude',{claude:async()=>{throw new Anthropic.APIConnectionTimeoutError();},openai:other}),/may have been charged/);
 await assert.rejects(()=>withFallback('claude',{claude:async()=>{throw Anthropic.APIError.generate(400,{type:'error',error:{type:'invalid_request_error',message:'bad'}},'bad',new Headers());},openai:other}));
 assert.equal(second,0);
 assert.equal(await withFallback('claude',{claude:async()=>{throw Anthropic.APIError.generate(429,{type:'error',error:{type:'rate_limit_error',message:'quota'}},'quota',new Headers());},openai:other}),'other');
 assert.equal(second,1);
}));
