import { useState, Fragment } from 'react'
import { Header } from "./components/Header"
import { DataView } from "./components/DataView"

const bandColors = {
  showband: "#ed2626",
  stetsons: "#eda426",
  roundup: "#26a4ed"
}

function App() {
  const [band, setBand] = useState<keyof bandColors>("showband")

  return <div style={{"--accent-color": bandColors[band]}}>
    <Header band={band} setBand={setBand}/>
    <main>
      <DataView band={band}/>
    </main>
  </div>
}

export default App
