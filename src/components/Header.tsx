import styles from "./Header.module.css";
import React from "react";

export const Header = ({band, setBand}: {band: string, setBand: React.Dispatch<React.SetStateAction<string>>}) => {
    return <header className={styles.header}>
        <div className={styles.about}>
            <h1>BoCList</h1>
            <i>Site by Avery Keuben</i>
        </div>
        <div className={styles.links}>
            <a className={band === "showband" && styles.active} onClick={() => setBand("showband")}>Stampede Showband</a>
            <a className={band === "stetsons" && styles.active} onClick={() => setBand("stetsons")}>Stetson Showband</a>
            <a className={band === "roundup" && styles.active} onClick={() => setBand("roundup")}>Roundup Band</a>
            <span className={styles.fill} />
            <button>Quick Generate</button>
        </div>
    </header>
}