import {z} from 'zod';
import {documentColor} from '../policy/htmlRules';
import {PAPER_SIZE_NAMES} from './paperSizes';
export const themeSchema = z.object({
  fontFamily: z.enum(['sans', 'serif', 'mono']),
  fontSize: z.number().min(9).max(40),
  lineHeight: z.number().min(1).max(3),
  primaryColor: z.string().refine((v) => {
    try {
      documentColor(v);
      return true;
    } catch {
      return false;
    }
  }),
  paperTheme: z.enum(['clean-white', 'warm-paper', 'dark-slate']),
  paperSize: z.enum(PAPER_SIZE_NAMES),
  margins: z.object({
    top: z.number().min(0).max(60),
    bottom: z.number().min(0).max(60),
    left: z.number().min(0).max(60),
    right: z.number().min(0).max(60),
  }),
});
