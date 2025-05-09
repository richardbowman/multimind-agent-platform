import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';
import { NavigateBefore, NavigateNext, Fullscreen, FullscreenExit } from '@mui/icons-material';

interface SlideRendererProps {
    content: string;
    mimeType: string;
}

export const SlideRenderer: React.FC<SlideRendererProps> = ({ content, mimeType }) => {
    const { registerActions, unregisterActions, updateActionState } = useToolbarActions();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [currentSlide, setCurrentSlide] = useState(1);
    const [totalSlides, setTotalSlides] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [slideLabel, setSlideLabel] = useState('Slide 1 of ?');

    const navigateSlide = useCallback((direction: 'prev' | 'next') => {
        if (iframeRef.current) {
            iframeRef.current.contentWindow?.postMessage(
                JSON.stringify({
                    method: direction === 'prev' ? 'left' : 'right'
                }),
                '*'
            );
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ method: 'availableRoutes' }), '*');
        }
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (iframeRef.current) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
                setIsFullscreen(false);
            } else {
                iframeRef.current.requestFullscreen();
                setIsFullscreen(true);
            }
        }
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data.namespace === 'reveal') {
                    if (data.eventName === 'callback' && data.method === 'getTotalSlides') {
                        setTotalSlides(data.result);
                        setSlideLabel(`Slide ${currentSlide} of ${data.result}`);
                    }
                    if (data.eventName === 'callback' && data.method === 'availableRoutes') {
                        updateActionState('reveal-prev', { disabled: !data.result.left });
                        updateActionState('reveal-next', { disabled: !data.result.right });
                    }
                    if (data.eventName === 'slidechanged') {
                        const newSlide = data.indexh + 1;
                        setCurrentSlide(newSlide);
                        setSlideLabel(`Slide ${newSlide} of ${totalSlides}`);
                        updateActionState('reveal-slide-number', { label: `Slide ${newSlide} of ${totalSlides}` });
                    }
                    if (data.eventName === 'ready') {
                        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ method: 'getTotalSlides' }), '*');
                        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ method: 'availableRoutes' }), '*');
                    }
                }
            } catch (error) {
                console.error('Error handling Reveal.js message:', error);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => window.removeEventListener('message', handleMessage);
    }, [totalSlides, updateActionState]);

    useEffect(() => {
        const presentationActions = [
            {
                id: 'reveal-prev',
                icon: <NavigateBefore />,
                label: 'Previous Slide',
                onClick: () => navigateSlide('prev'),
                disabled: currentSlide === 1
            },
            {
                id: 'reveal-next',
                icon: <NavigateNext />,
                label: 'Next Slide',
                onClick: () => navigateSlide('next'),
                disabled: currentSlide === totalSlides
            },
            {
                id: 'reveal-fullscreen',
                icon: isFullscreen ? <FullscreenExit /> : <Fullscreen />,
                label: isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen',
                onClick: toggleFullscreen
            },
            {
                id: 'reveal-slide-number',
                label: slideLabel,
                disabled: true
            }
        ];

        registerActions('reveal', presentationActions);
        return () => unregisterActions('reveal');
    }, [registerActions, unregisterActions, navigateSlide, toggleFullscreen, currentSlide, totalSlides]);

    const theme = useTheme();
    const presentationData = JSON.parse(typeof content === 'string' ? content : new TextDecoder().decode(content));
    const revealTheme = theme.palette.mode === 'dark' ? 'dracula' : 'simple';
    
    const htmlContent = `
        <!doctype html>
        <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <title>${presentationData.title}</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reveal.min.css">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/theme/${revealTheme}.css">
            </head>
            <body>
                <div class="reveal">
                    <div class="slides">
                        ${presentationData.slides.map((slide, index) => `
                            <section 
                                data-transition="${slide.transition || 'fade'}"
                                data-background="${slide.background || ''}"
                                data-markdown
                                data-auto-animate="${slide.autoAnimate || false}"
                            >
                                <textarea data-template>
                                    ${slide.title ? `## ${slide.title}\n\n` : ''}
                                    ${slide.content}
                                </textarea>
                                ${slide.notes ? `<aside class="notes">${slide.notes}</aside>` : ''}
                            </section>
                        `).join('\n')}
                    </div>
                </div>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reveal.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/plugin/markdown/markdown.min.js"></script>
                <script>
                    Reveal.initialize({
                        plugins: [ RevealMarkdown ],
                        hash: true,
                        postMessage: true,
                        postMessageEvents: true,
                        transition: 'fade'
                    });

                    // Send initial slide count
                    window.parent.postMessage(JSON.stringify({
                        namespace: 'reveal',
                        eventName: 'ready',
                        state: {
                            totalSlides: Reveal.getTotalSlides()
                        }
                    }), '*');

                    // Listen for slide changes
                    Reveal.on('slidechanged', event => {
                        window.parent.postMessage(JSON.stringify({
                            namespace: 'reveal',
                            eventName: 'slidechanged',
                            state: {
                                indexh: event.indexh,
                                indexv: event.indexv
                            }
                        }), '*');
                    });
                </script>
            </body>
        </html>
    `;
    
    const [iframeSrc] = useState(() => {
        const blob = new Blob([htmlContent], { type: 'text/html' });
        return URL.createObjectURL(blob);
    });

    useEffect(() => {
        return () => {
            URL.revokeObjectURL(iframeSrc);
        };
    }, [iframeSrc]);

    return (
        <Box sx={{
            width: '100%',
            height: '70vh',
            border: '1px solid #ddd',
            borderRadius: '4px',
            overflow: 'hidden'
        }}>
            <iframe
                ref={iframeRef}
                src={iframeSrc}
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none'
                }}
                title="Reveal.js Presentation"
                allowFullScreen
                key={iframeSrc} // Add key to prevent re-renders
            />
        </Box>
    );
};
