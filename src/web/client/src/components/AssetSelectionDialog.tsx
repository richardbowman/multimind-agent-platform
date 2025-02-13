import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArtifactType } from '../../../../tools/artifact';

interface AssetSelectionDialogProps {
    assets: Array<{
        id: string;
        metadata: {
            title: string;
            description?: string;
            previewUrl?: string;
            type?: ArtifactType;
        };
    }>;
    onSelect: (assetIds: string[]) => void;
    onClose: () => void;
}

export const AssetSelectionDialog: React.FC<AssetSelectionDialogProps> = ({ assets, onSelect, onClose }) => {
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<ArtifactType[]>([]);

    const filteredAssets = assets.filter(asset => {
        const matchesSearch = asset.metadata.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (asset.metadata.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

        const matchesType = selectedTypes.length === 0 ||
            (asset.metadata.type && selectedTypes.includes(asset.metadata.type));

        return matchesSearch && matchesType;
    });

    const handleSelect = (assetId: string) => {
        setSelectedAssets(prev =>
            prev.includes(assetId)
                ? prev.filter(id => id !== assetId)
                : [...prev, assetId]
        );
    };

    return createPortal(
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#2a2a2a',
            padding: '20px',
            borderRadius: '8px',
            width: '800px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'row',
            gap: '20px',
            zIndex: 9999
        }}>
            {/* Sidebar */}
            <div style={{
                width: '200px',
                padding: '10px',
                borderRight: '1px solid #444'
            }}>
                <h4 style={{ margin: '0 0 10px 0' }}>Filters</h4>

                {/* Search */}
                <input
                    type="text"
                    placeholder="Search assets..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '8px',
                        marginBottom: '15px',
                        borderRadius: '4px',
                        border: '1px solid #444',
                        backgroundColor: '#333',
                        color: '#fff'
                    }}
                />

                {/* Type Filters */}
                <div style={{ marginBottom: '15px' }}>
                    <h5 style={{ margin: '0 0 8px 0' }}>Types</h5>
                    {Object.values(ArtifactType).map(type => (
                        <div key={type} style={{ marginBottom: '5px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedTypes.includes(type)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedTypes([...selectedTypes, type]);
                                        } else {
                                            setSelectedTypes(selectedTypes.filter(t => t !== type));
                                        }
                                    }}
                                />
                                {type}
                            </label>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <h3 style={{ margin: '0 0 20px 0' }}>Select Assets</h3>
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: '10px',
                    padding: '10px'
                }}>
                    {filteredAssets.map(asset => (
                        <div
                            key={asset.id}
                            style={{
                                border: selectedAssets.includes(asset.id) ? '2px solid #646cff' : '1px solid #444',
                                borderRadius: '4px',
                                padding: '10px',
                                cursor: 'pointer',
                                backgroundColor: selectedAssets.includes(asset.id) ? '#333' : '#2a2a2a',
                                transition: 'all 0.2s'
                            }}
                            onClick={() => handleSelect(asset.id)}
                        >
                            {asset.metadata.previewUrl && (
                                <img
                                    src={asset.metadata.previewUrl}
                                    alt={asset.metadata.title}
                                    style={{
                                        width: '100%',
                                        height: '100px',
                                        objectFit: 'cover',
                                        borderRadius: '4px',
                                        marginBottom: '8px'
                                    }}
                                />
                            )}
                            <div style={{ fontSize: '0.9em' }}>{asset.metadata.title}</div>
                            {asset.metadata.description && (
                                <div style={{ fontSize: '0.8em', color: '#aaa' }}>
                                    {asset.metadata.description}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    marginTop: '20px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #444',
                            backgroundColor: 'transparent',
                            color: '#fff',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onSelect(selectedAssets);
                            onClose();
                        }}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#646cff',
                            color: '#fff',
                            cursor: 'pointer'
                        }}
                    >
                        Attach Selected
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('portal-root')!
    );
};
