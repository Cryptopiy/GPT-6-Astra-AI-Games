type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown|Promise<unknown>};
export interface ModelContext {registerTool(tool:Tool,options?:{signal?:AbortSignal}):void|Promise<void>}
export interface ModelActions {start(height:number):void|Promise<void>;reset():void|Promise<void>;read():unknown}
function objectInput(input:unknown){if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected an object');return input as Record<string,unknown>;}
export function registerSimulationTools(context:ModelContext|undefined,actions:ModelActions){
  const lifecycle=new AbortController();if(!context?.registerTool)return()=>lifecycle.abort();
  const specs:Tool[]=[
    {name:'read_tsunami_state',title:'Read tsunami state',description:'Read the current wave configuration and live coastal flood statistics.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(Object.keys(objectInput(input)).length)throw new Error('No arguments expected');return actions.read();}},
    {name:'start_tsunami',title:'Start tsunami',description:'Set wave height and begin a new coastal simulation. The current run must first finish or be reset.',inputSchema:{type:'object',properties:{height:{type:'number',minimum:1,maximum:20,multipleOf:.5}},required:['height'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){const p=objectInput(input);if(Object.keys(p).length!==1||typeof p.height!=='number'||!Number.isFinite(p.height)||p.height<1||p.height>20||p.height*2%1!==0)throw new Error('height must be 1–20 metres in 0.5 metre steps');await actions.start(p.height);return actions.read();}},
    {name:'reset_tsunami',title:'Reset tsunami',description:'Stop the current event and restore the initial water, vehicles, statistics and timeline.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){if(Object.keys(objectInput(input)).length)throw new Error('No arguments expected');await actions.reset();return actions.read();}}
  ];
  for(const spec of specs){try{void Promise.resolve(context.registerTool(spec,{signal:lifecycle.signal})).catch(()=>{/* Optional browser capability. */});}catch{/* Browser does not implement this draft API. */}}
  return()=>lifecycle.abort();
}
