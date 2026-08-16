import { useState, Fragment } from 'react'
import { Header } from "./components/Header"
import { DataView } from "./components/DataView"
import { PlaylistView } from "./components/PlaylistView"
import styles from "./App.module.css"

const bandColors = {
  showband: "#ed2626",
  stetsons: "#eda426",
  roundup: "#26a4ed"
}

function App() {
  const [band, setBand] = useState<keyof bandColors>("showband")

  return <div className={styles.main} style={{"--accent-color": bandColors[band]}}>
    <Header band={band} setBand={setBand}/>
    <main className={styles.content}>
      <DataView band={band}/>
      <PlaylistView band={band}/>
    </main>
  </div>
}

export default App
