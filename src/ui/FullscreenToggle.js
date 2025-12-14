// Fullscreen Toggle UI Module
// Handles fullscreen functionality

export class FullscreenToggle {
    constructor() {
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.init();
    }
    
    init() {
        if (!this.fullscreenBtn) return;
        
        this.updateFullscreenIcon();
        
        // Toggle fullscreen
        this.fullscreenBtn.addEventListener('click', async () => {
            await this.toggleFullscreen();
        });
        
        // Listen for fullscreen changes
        document.addEventListener('fullscreenchange', () => this.updateFullscreenIcon());
        document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenIcon());
        document.addEventListener('mozfullscreenchange', () => this.updateFullscreenIcon());
        document.addEventListener('MSFullscreenChange', () => this.updateFullscreenIcon());
    }
    
    updateFullscreenIcon() {
        const isFullscreen = !!(document.fullscreenElement || 
                               document.webkitFullscreenElement || 
                               document.mozFullScreenElement || 
                               document.msFullscreenElement);
        const enterIcon = this.fullscreenBtn.querySelector('.fullscreen-enter');
        const exitIcon = this.fullscreenBtn.querySelector('.fullscreen-exit');
        
        if (enterIcon && exitIcon) {
            if (isFullscreen) {
                enterIcon.style.display = 'none';
                exitIcon.style.display = 'block';
            } else {
                enterIcon.style.display = 'block';
                exitIcon.style.display = 'none';
            }
        }
    }
    
    async toggleFullscreen() {
        try {
            if (!document.fullscreenElement && 
                !document.webkitFullscreenElement && 
                !document.mozFullScreenElement && 
                !document.msFullscreenElement) {
                // Enter fullscreen
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                } else if (document.documentElement.webkitRequestFullscreen) {
                    await document.documentElement.webkitRequestFullscreen();
                } else if (document.documentElement.mozRequestFullScreen) {
                    await document.documentElement.mozRequestFullScreen();
                } else if (document.documentElement.msRequestFullscreen) {
                    await document.documentElement.msRequestFullscreen();
                }
            } else {
                // Exit fullscreen
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    await document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    await document.msExitFullscreen();
                }
            }
        } catch (error) {
            console.error('Error toggling fullscreen:', error);
        }
    }
}

