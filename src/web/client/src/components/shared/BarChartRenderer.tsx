import React from 'react';
import { Box, Typography } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BarChartData {
    labels: string[];
    datasets: {
        label: string;
        data: number[];
        backgroundColor?: string;
    }[];
}

interface BarChartRendererProps {
    data: BarChartData;
}

export const BarChartRenderer: React.FC<BarChartRendererProps> = ({ data }) => {
    if (!data || !data.labels || !data.datasets) {
        return <Typography color="error">Invalid chart data format</Typography>;
    }

    // Transform data into Recharts format
    const chartData = data.labels.map((label, index) => {
        const dataPoint: Record<string, any> = { label };
        data.datasets.forEach(dataset => {
            dataPoint[dataset.label] = dataset.data[index];
        });
        return dataPoint;
    });

    return (
        <Box sx={{ height: '400px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={chartData}
                    margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {data.datasets.map((dataset, index) => (
                        <Bar
                            key={index}
                            dataKey={dataset.label}
                            fill={dataset.backgroundColor || `#${Math.floor(Math.random()*16777215).toString(16)}`}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </Box>
    );
};
