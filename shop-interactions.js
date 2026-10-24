(() => {
'use strict';
        const carousel = document.querySelector(".carousel");
        const track = document.querySelector(".carousel-track");
        const carouselHint = document.querySelector(".carousel-hint");
        const reducedCarouselMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let carouselSlideCount = 0;

        // Asks YouTube for the playlist and puts the newest videos at the start of the track
        let latestCarouselId = null;
        async function addLatestVideos(force = false) {
          if (carousel.classList.contains("is-dragging") || carousel.matches(':focus-within')) return false;
          const { items } = await window.BTYouTube.getPage("videos", { force });
          const video = items[0];
          if (!video || video.id === latestCarouselId) return false;
          const li = document.createElement("li");
          li.dataset.latestEpisode = "true";
          const link = document.createElement("a");
          link.href = `https://www.youtube.com/watch?v=${video.id}`;
          link.target = "_blank";
          link.rel = "noopener";
          const img = document.createElement("img");
          img.src = video.thumbnail;
          img.alt = "";
          img.width = 320;
          img.height = 180;
          img.loading = "lazy";
          img.decoding = "async";
          const caption = document.createElement("p");
          caption.textContent = video.title;
          link.append(img, caption);
          li.append(link);
          track.querySelectorAll(".is-clone, [data-latest-episode]").forEach(slide => slide.remove());
          track.prepend(li);
          latestCarouselId = video.id;
          return true;
        }

        // Copies the slides so the loop never shows a gap, then starts the animation
        function startCarousel() {
        if (!track.children.length) return;

        track.querySelectorAll(".is-clone").forEach(slide => slide.remove());
        const originals = [...track.children];
        carouselSlideCount = originals.length;
        const setWidth = track.offsetWidth;
        if (!setWidth) return;
        const copies = reducedCarouselMotion ? 0 : Math.max(1, Math.ceil(carousel.clientWidth / setWidth));

        for (let i = 0; i < copies; i++) {
            originals.forEach((item) => {
            const clone = item.cloneNode(true);
            clone.classList.add("is-clone");
            clone.setAttribute("aria-hidden", "true");
            const link = clone.querySelector("a");
            if (link) link.tabIndex = -1;
            track.appendChild(clone);
            });
        }

        track.style.setProperty("--count", originals.length);
        track.style.setProperty("--duration", `${originals.length * 5}s`);
        if (!reducedCarouselMotion) carousel.classList.add("is-ready");
        }

        if (carousel && track) {
        if (!reducedCarouselMotion) {
            let dragState = null;
            let suppressNextClick = false;
            let carouselHintAnimation;
            let swipeSettleAnimation;
            let hintResetTimer;

            function startCarouselHintAnimation() {
            carouselHintAnimation?.cancel();
            carouselHintAnimation = carouselHint?.animate(
                [{ transform: "translateX(-6px)" }, { transform: "translateX(6px)" }],
                { duration: 900, iterations: Infinity, direction: "alternate", easing: "ease-in-out" }
            );
            if (carousel.classList.contains("is-paused")) carouselHintAnimation?.pause();
            }

            function updateHintThumb(clientX) {
            const hintTrack = carouselHint?.querySelector(".carousel-hint-track");
            if (!hintTrack) return;

            const rect = hintTrack.getBoundingClientRect();
            const thumbWidth = 32;
            const thumbX = Math.max(0, Math.min(rect.width - thumbWidth, clientX - rect.left - thumbWidth / 2));
            carouselHint.style.setProperty("--hint-thumb-x", `${thumbX}px`);
            }

            function finishHintSwipe() {
            if (!carouselHint) return;

            const hintTrack = carouselHint.querySelector(".carousel-hint-track");
            if (hintTrack) {
                carouselHint.style.setProperty("--hint-thumb-x", `${(hintTrack.clientWidth - 32) / 2}px`);
            }
            carouselHint.classList.remove("is-dragging");
            window.clearTimeout(hintResetTimer);
            hintResetTimer = window.setTimeout(() => {
                carouselHint.style.removeProperty("--hint-thumb-x");
                startCarouselHintAnimation();
            }, 350);
            }

            carousel.addEventListener("motionchange", (event) => {
              if (event.detail.paused) carouselHintAnimation?.pause();
              else carouselHintAnimation?.play();
            });
            startCarouselHintAnimation();

            function resumeCarousel(position) {
            const styles = getComputedStyle(carousel);
            const slideWidth = parseFloat(styles.getPropertyValue("--slide-w"));
            const slideGap = parseFloat(styles.getPropertyValue("--slide-gap"));
            const loopDistance = carouselSlideCount * (slideWidth + slideGap);
            const duration = carouselSlideCount * 5;
            let normalizedPosition = position % loopDistance;

            if (normalizedPosition > 0) normalizedPosition -= loopDistance;
            track.style.animation = "none";
            track.style.transform = `translate3d(${normalizedPosition}px, 0, 0)`;
            void track.offsetWidth;
            track.style.transform = "";
            track.style.animation = "";
            track.style.animationDelay = `${(normalizedPosition / loopDistance) * duration}s`;
            }

            function beginCarouselDrag(event) {
            if (!carousel.classList.contains("is-ready") || event.button > 0) return;

            const transform = getComputedStyle(track).transform;
            const position = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
            swipeSettleAnimation?.cancel();
            swipeSettleAnimation = null;
            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastTime: event.timeStamp,
                velocity: 0,
                startPosition: position,
                position,
                dragging: false
            };
            track.style.animation = "none";
            track.style.transform = `translate3d(${position}px, 0, 0)`;
            }

            carousel.addEventListener("pointerdown", beginCarouselDrag);
            carouselHint?.addEventListener("pointerdown", beginCarouselDrag);

            document.addEventListener("pointermove", (event) => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;

            const deltaX = event.clientX - dragState.startX;
            const deltaY = event.clientY - dragState.startY;
            if (!dragState.dragging && (Math.abs(deltaY) > Math.abs(deltaX) || Math.abs(deltaX) < 6)) return;

            if (!dragState.dragging) {
                dragState.dragging = true;
                window.clearTimeout(hintResetTimer);
                carousel.classList.add("is-dragging");
                carouselHintAnimation?.cancel();
                carouselHint?.classList.add("is-dragging");
            }

            event.preventDefault();
            const elapsed = Math.max(1, event.timeStamp - dragState.lastTime);
            const instantVelocity = (event.clientX - dragState.lastX) / elapsed;
            dragState.velocity = dragState.velocity * 0.65 + instantVelocity * 0.35;
            dragState.lastX = event.clientX;
            dragState.lastTime = event.timeStamp;

            const styles = getComputedStyle(carousel);
            const slideWidth = parseFloat(styles.getPropertyValue("--slide-w"));
            const slideGap = parseFloat(styles.getPropertyValue("--slide-gap"));
            const loopDistance = carouselSlideCount * (slideWidth + slideGap);
            dragState.position = dragState.startPosition + deltaX;
            while (dragState.position > 0) dragState.position -= loopDistance;
            while (dragState.position <= -loopDistance) dragState.position += loopDistance;
            track.style.transform = `translate3d(${dragState.position}px, 0, 0)`;
            updateHintThumb(event.clientX);
            });

            function finishCarouselDrag(event) {
            if (!dragState || event.pointerId !== dragState.pointerId) return;

            const { position, velocity, dragging } = dragState;
            dragState = null;
            carousel.classList.remove("is-dragging");

            if (dragging) {
                const coast = Math.max(-180, Math.min(180, velocity * 180));
                const targetPosition = position + coast;
                swipeSettleAnimation?.cancel();
                swipeSettleAnimation = track.animate(
                [
                    { transform: `translate3d(${position}px, 0, 0)` },
                    { transform: `translate3d(${targetPosition}px, 0, 0)` }
                ],
                { duration: 380, easing: "cubic-bezier(0.22, 0.75, 0.25, 1)" }
                );
                swipeSettleAnimation.onfinish = () => {
                swipeSettleAnimation.cancel();
                swipeSettleAnimation = null;
                resumeCarousel(targetPosition);
                };
                suppressNextClick = true;
                window.setTimeout(() => { suppressNextClick = false; }, 400);
                finishHintSwipe();
            } else {
                resumeCarousel(position);
            }
            }

            document.addEventListener("pointerup", finishCarouselDrag);
            document.addEventListener("pointercancel", finishCarouselDrag);
            carousel.addEventListener("click", (event) => {
            if (!suppressNextClick) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            suppressNextClick = false;
            }, true);
        }

        addLatestVideos()
            .catch((error) => console.error("Carousel: could not load YouTube videos", error))
            .finally(startCarousel);   // Manual slides remain usable if the API fails.
        window.BTYouTube.watch(async () => {
          if (await addLatestVideos(true)) startCarousel();
        });
        }
        
})();
