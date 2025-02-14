import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { Chart, registerables } from 'chart.js';
import { BarChartData } from '../../../../../schemas/BarChartData';
import { CustomScrollbarStyles } from '../../styles/styles';

Chart.register(...registerables);

interface ChartRendererProps {
    data: BarChartData;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({ data }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (chartRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                // Destroy existing chart instance if it exists
                if (chartInstance.current) {
                    chartInstance.current.destroy();
                }

                chartInstance.current = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.xAxis.categories,
                        datasets: data.series.map(series => ({
                            label: series.name,
                            data: series.data,
                            backgroundColor: series.color || 'rgba(54, 162, 235, 0.6)',
                            borderColor: series.color || 'rgba(54, 162, 235, 1)',
                            borderWidth: 1
                        }))
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: data.xAxis.label
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: data.yAxis.label
                                },
                                beginAtZero: true,
                                min: data.yAxis.min,
                                max: data.yAxis.max
                            }
                        },
                        plugins: {
                            title: {
                                display: true,
                                text: data.title
                            }
                        }
                    }
                });
            }
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data]);

    return (
        <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            overflow: 'auto',
            ...CustomScrollbarStyles,
            p: 2
        }}>
            <Paper elevation={3} sx={{ 
                p: 2,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0 // Fixes flexbox overflow issue
            }}>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                    <canvas ref={chartRef} style={{ width: '100%', height: '100%' }} />
                </Box>
            </Paper>
            {data.metadata?.source && (
                <Typography variant="caption" sx={{ mt: 1 }}>
                    Source: {data.metadata.source}
                </Typography>
            )}
        </Box>
    );
};
