import {test,expect,type Page} from './fixtures';

/**
 * 量一小块图里两段墨迹的竖直中心：按列分成两段，各自取上下沿的中点。
 * 像素在页面里用 canvas 量（data URL 不污染画布）⇒ 不需要额外的依赖。
 */
const inkCentres=async(page:Page,clip:{x:number;y:number;width:number;height:number},split:number)=>{
 const shot=await page.screenshot({clip});
 return page.evaluate(async({base64,split})=>{
  const image=new Image();
  image.src='data:image/png;base64,'+base64;
  await image.decode();
  const canvas=document.createElement('canvas');
  canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');
  if(!context)return{icon:null,text:null};
  context.drawImage(image,0,0);
  const {data,width,height}=context.getImageData(0,0,canvas.width,canvas.height);
  const centre=(from:number,to:number)=>{
   let top=-1,bottom=-1;
   for(let y=0;y<height;y++)for(let x=from;x<to;x++){
    const i=(y*width+x)*4;
    if((data[i]??0)>90||(data[i+1]??0)>90||(data[i+2]??0)>90){if(top<0)top=y;bottom=y;}
   }
   return top<0?null:(top+bottom)/2;
  };
  return{icon:centre(0,split),text:centre(split,width)};
 },{base64:shot.toString('base64'),split});
};

test('the marker sits on the same ink centre as the title',async({page})=>{
 // 页面抛错先报出来：否则它会伪装成"等不到某个元素"。
 page.on('pageerror',e=>console.log('页面 pageerror:',String(e).slice(0,300)));
 await page.goto('/');
 // 应用初始化完就会有一份草稿（存储为空时自建默认文档）⇒ 等编辑器出现即可。
 // 不要用 count() 判断"有没有文档"：初始化期间编辑器还没渲染，count 会是 0。
 const editor=page.locator('textarea');
 await expect(editor).toBeVisible();
 await editor.fill('# 第一部分 总体规定\n\n正文\n\n## 第二章 总则\n\n正文');
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:/^大纲 \(/}).click();
 // 等运行时的光学对齐测量跑完：它把偏移写成行内 px 值（样式表里的兜底是 em）。
 // 用固定等待会在负载下抢跑（测量的 effect 还没跑，量的是未校准的偏移）。
 await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--mf-icon-optical-offset').endsWith('px'));
 const geometry=await page.evaluate(()=>{
  const title=[...document.querySelectorAll('aside button[title]')].find(button=>button.getAttribute('title')?.startsWith('第一部分'));
  if(!title)throw new Error('标题行不在列表里');
  const row=title.parentElement!,slot=row.firstElementChild!;
  const box=(element:Element)=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
  return{row:box(row),slot:box(slot)};
 });
 // 裁剪往里缩 2px：行的边框不参与墨迹的判定。
 const clip={x:geometry.row.x+2,y:geometry.row.y+2,width:geometry.row.width-4,height:geometry.row.height-4};
 const split=Math.round(geometry.slot.x+geometry.slot.width-(geometry.row.x+2));
 const centres=await inkCentres(page,clip,split);
 const offset=await page.evaluate(()=>document.documentElement.style.getPropertyValue('--mf-icon-optical-offset'));
 console.log('偏移变量:',JSON.stringify(offset),'图标墨迹:',centres.icon,'文字墨迹:',centres.text);
 expect(centres.icon).not.toBeNull();
 expect(centres.text).not.toBeNull();
 // 图标与标题的墨迹中心落在同一条线上：半像素以内算齐。
 expect(Math.abs(centres.icon!-centres.text!)).toBeLessThan(1.5);
});
