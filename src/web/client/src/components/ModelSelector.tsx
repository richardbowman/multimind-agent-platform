import React, { useState, useEffect } from 'react';
import { ModelInfo } from 'src/llm/types';
import { invoke } from '@tauri-apps/api/tauri';
import { Button, Input, Card, List, Typography, Space, Alert } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import './ModelSelector.css';

const { Text } = Typography;

interface ModelSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    provider: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange, provider }) => {
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);

    useEffect(() => {
        loadModels();
    }, [provider]);

    const loadModels = async (searchTerm = '') => {
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<ModelInfo[]>('get_available_models', { 
                provider,
                search: searchTerm 
            });
            setModels(result);
        } catch (err) {
            setError('Failed to load models');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearch(value);
        loadModels(value);
    };

    const handleSelect = (model: ModelInfo) => {
        setSelectedModel(model);
        if (onChange) {
            onChange(model.id);
        }
    };

    return (
        <div className="model-selector">
            <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                    placeholder="Search models..."
                    prefix={<SearchOutlined />}
                    value={search}
                    onChange={handleSearch}
                    allowClear
                />

                {error && <Alert message={error} type="error" showIcon />}

                <div className="model-list-container">
                    <List
                        loading={loading}
                        dataSource={models}
                        renderItem={(model) => (
                            <List.Item 
                                onClick={() => handleSelect(model)}
                                className={`model-item ${selectedModel?.id === model.id ? 'selected' : ''}`}
                            >
                                <Card hoverable style={{ width: '100%' }}>
                                    <Space direction="vertical">
                                        <Text strong>{model.id}</Text>
                                        <Text type="secondary">{model.provider}</Text>
                                        <Text>{model.description}</Text>
                                        <Text type="secondary">
                                            Context: {model.contextSize} tokens | 
                                            Max Tokens: {model.maxTokens}
                                        </Text>
                                    </Space>
                                </Card>
                            </List.Item>
                        )}
                    />
                </div>

                {selectedModel && (
                    <div className="selected-model">
                        <Text strong>Selected Model:</Text>
                        <Text>{selectedModel.id}</Text>
                    </div>
                )}
            </Space>
        </div>
    );
};

export default ModelSelector;
