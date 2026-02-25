import { Route, Switch } from 'wouter'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { PdfViewPage } from './pages/PdfViewPage'

function App() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/pdf/:id" component={PdfViewPage} />
      <Route component={() => <div>Not found</div>} />
    </Switch>
  )
}

export default App
