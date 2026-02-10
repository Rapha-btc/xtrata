import { useEffect, useState } from 'react';

type CollectionRecord = {
  id: string;
  slug: string;
  artist_address: string;
  contract_address: string | null;
  display_name: string | null;
  state: string;
};

export default function CollectionListPanel() {
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/collections', { signal: controller.signal });
        if (!response.ok) {
          const details = await response.text();
          throw new Error(`Collections endpoint returned ${response.status}: ${details.slice(0, 128)}`);
        }
        const text = await response.text();
        try {
          const payload = JSON.parse(text) as CollectionRecord[];
          setCollections(payload);
        } catch (parseError) {
          const snippet = text.slice(0, 128).replace(/\n/g, ' ');
          throw new Error(`Collections response is not JSON: ${snippet}`);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message ?? 'Unable to load collections');
        }
      }
    };
    load();
    return () => controller.abort();
  }, []);

  if (error) {
    return <div className="alert">{error}</div>;
  }

  if (collections.length === 0) {
    return <p>No collections yet. Players can create one via the deploy wizard.</p>;
  }

  return (
    <div className="collection-list">
      {collections.map((collection) => (
        <div key={collection.id} className="collection-list__item">
          <strong>{collection.display_name ?? collection.slug}</strong>
          <p>{collection.slug} · {collection.state}</p>
          <p>{collection.contract_address ?? 'contract pending'}</p>
        </div>
      ))}
    </div>
  );
}
