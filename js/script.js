// ===== PRODUCT CAROUSEL =====
            const carouselTrack = document.querySelector('.carousel-track');
            const productItems = document.querySelectorAll('.product-item');
            let currentIndex = 0;
            
            function updateCarousel() {
                const itemWidth = productItems[0].offsetWidth + 15; // width + gap
                carouselTrack.style.transform = `translateX(-${currentIndex * itemWidth}px)`;
            }
            
            // Auto-rotate carousel
            setInterval(function() {
                currentIndex = (currentIndex + 1) % (productItems.length - 2);
                updateCarousel();
            }, 3000);
            
            // Initial carousel setup
            updateCarousel();