declare module 'pagedjs' {
 export class Previewer {
  preview(content:string|Node,styles:Record<string,string>[],target:HTMLElement):Promise<{total:number}>;
  polisher:{destroy():void};
  chunker:{destroy():void};
 }
}
