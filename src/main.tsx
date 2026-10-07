import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { installQaBridge } from './qa/bridge'
import './styles/app.css'

const host = document.getElementById('root')
if (!host) throw new Error('星履需要一个 #root 容器')

// 只在 ?qa 时安装的只读验收探针（默认为空操作）
installQaBridge()

createRoot(host).render(
  <StrictMode>
    {/* 顶层错误边界：任何渲染异常都要给出「数据还在」+「导出」+「重载」的出口，
        绝不能是一整页白屏 —— 这个应用的本地存着用户一生的记录。 */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
