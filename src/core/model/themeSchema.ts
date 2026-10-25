import {z} from 'zod';
import {documentColor} from '../policy/htmlRules';
export const themeSchema=z.object({
 fontFamily:z.enum(['sans','serif','mono']),fontSize:z.number().min(9).max(40),lineHeight:z.number().min(1).max(3),
 primaryColor:z.string().refine(v=>{try{documentColor(v);return true}catch{return false}}),
 paperTheme:z.enum(['clean-white','warm-paper','dark-slate']),paperSize:z.literal('A4'),
 margins:z.object({top:z.number().min(0).max(60),bottom:z.number().min(0).max(60),left:z.number().min(0).max(60),right:z.number().min(0).max(60)}),
});
