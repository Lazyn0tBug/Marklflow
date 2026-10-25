import {runMarkdownWorkerTask} from '../application/tasks/markdownWorkerTask';
self.addEventListener('message',(event:MessageEvent<unknown>)=>runMarkdownWorkerTask(event.data,message=>self.postMessage(message)));
