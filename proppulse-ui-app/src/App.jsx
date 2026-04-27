import { useEffect, useState } from "react";

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}data/prophit_latest.json`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load JSON");
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => {
        console.error(err);
        setError("Unable to load model data");
      });
  }, []);

  return (
    <div style={{ padding: "20px", color: "white" }}>
      <h1>PropHit Board</h1>

      {error && <div style={{ color: "red" }}>{error}</div>}

      {!data && !error && <div>Loading...</div>}

      {data && (
        <pre
          style={{
            background: "#111",
            padding: "10px",
            borderRadius: "8px",
            overflow: "auto",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
