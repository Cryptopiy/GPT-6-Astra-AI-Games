export type ControlAction = 'start' | 'pause' | 'resume' | 'reset';
export type Tool = { name: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean }; execute(input: unknown): unknown };
export type ModelContext = { registerTool(tool: Tool, options: { signal: AbortSignal }): void | Promise<void> };
export function installModelTools(context: ModelContext | undefined, actions: { read(): unknown; control(action: ControlAction, height?: number): unknown }): () => void {
  if(!context?.registerTool)return()=>{};
  const lifecycle=new AbortController();
  const tools:Tool[]=[
    {name:'read_tsunami_simulation',description:'Read the current wave, elapsed time and flood statistics from the local simulation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){
      if(input===null||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object.');
      return actions.read();
    }},
    {name:'control_tsunami_simulation',description:'Start a new local tsunami run with height 1–20 m, pause, resume, or reset water and vehicles. Starting replaces the current run.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','resume','reset']},height:{type:'number',minimum:1,maximum:20}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},async execute(input){
      if(input===null||typeof input!=='object'||Array.isArray(input))throw new Error('Expected an action object.');
      const value=input as Record<string,unknown>;
      if(Object.keys(value).some(k=>!['action','height'].includes(k))||!['start','pause','resume','reset'].includes(String(value.action)))throw new Error('Unknown action or property.');
      if(value.action==='start'&&(typeof value.height!=='number'||!Number.isFinite(value.height)||value.height<1||value.height>20||!Number.isInteger(value.height)))throw new Error('Start requires a whole-meter height from 1 to 20.');
      if(value.action!=='start'&&value.height!==undefined)throw new Error('Height is only accepted when starting a run.');
      actions.control(value.action as ControlAction,value.height as number|undefined);
      // React commits the same visible counters before the tool returns.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      return actions.read();
    }}
  ];
  for(const tool of tools){
    try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser API; the visible controls remain available. */}
  }
  return()=>lifecycle.abort();
}
