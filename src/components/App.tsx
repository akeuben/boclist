import { useState } from 'react'
import { Header } from "./Header"
import { DataView } from "./DataView"
import { PlaylistView } from "./PlaylistView"
import styles from "./App.module.css"

const bandColors: Record<Band, string> = {
  showband: "#ed2626",
  stetsons: "#eda426",
  roundup: "#26a4ed"
}

function App() {
  const [band, setBand] = useState<keyof typeof bandColors>("showband")

  return <div className={styles.main} style={{"--accent-color": bandColors[band]} as any}>
    <Header band={band} setBand={setBand}/>
    <main className={styles.content}>
      <DataView band={band}/>
      <PlaylistView band={band}/>
    </main>
  </div>
}

export default App
