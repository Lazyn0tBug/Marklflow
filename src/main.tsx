import './styles/document.css';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {ErrorBoundary} from './components/ErrorBoundary';
import {installWindowCapture,reactSource,reportCapture} from './core/platform/web/capture';

/** 浏览器的两个捕获点 ✓（脚本错误 ✓ 与未处理的拒绝 ✓）。 */
installWindowCapture();

createRoot(document.getElementById('root')!,{
 // 被边界接住的错误 ⇒ **由边界报** ✓（它知道"起不来"还是"这一部分" ✓）
 // ⇒ ⇒ 这里什么都不做 ✓ ⇒ ⇒ React 默认的那句控制台输出也就不响了 ✓
 // ⇒ ⇒ 控制台里只有消息端口那一份 ✓（原始文本只在一处 ✓）。
 onCaughtError:()=>{},
 // 没有边界接住的 ⇒ 整个工作台起不来 ⇒ 这里报 ✓。
 onUncaughtError:(error,info)=>{
  void reportCapture('startup',error,reactSource(info.componentStack));
 },
}).render(
 <ErrorBoundary root fallback={<p role="alert">工作台没能完整显示，请重新加载窗口。</p>}>
  <App/>
 </ErrorBoundary>,
);
