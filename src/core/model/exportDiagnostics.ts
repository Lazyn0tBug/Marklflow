export interface OutputIssue {nodeId:string;adaptation:'mapped'|'static'|'unsupported';message:string}
export const DOCX_FORMULA_IMAGE_MESSAGE='公式输出SVG/PNG图片，不是Word原生可编辑公式';
export interface DocxIssueGroup {adaptation:OutputIssue['adaptation'];summary:string;issues:OutputIssue[]}
/** Keep source-level details, but show repeated capability information once. */
export function groupDocxIssues(issues:readonly OutputIssue[]):DocxIssueGroup[]{
 const groups=new Map<string,DocxIssueGroup>();
 for(const issue of issues){const key=issue.adaptation+'\0'+issue.message;let group=groups.get(key);if(!group){group={adaptation:issue.adaptation,summary:'',issues:[]};groups.set(key,group)}group.issues.push(issue)}
 for(const group of groups.values()){const message=group.issues[0]!.message,count=group.issues.length;group.summary=message===DOCX_FORMULA_IMAGE_MESSAGE?'本次 '+count+' 个公式将以图片输出，不是Word原生可编辑公式':count+' 处：'+message}
 return [...groups.values()];
}
