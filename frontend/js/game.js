document.addEventListener('DOMContentLoaded', function() {

        // --- DOM Elements ---
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const scoreDisplay = document.getElementById('score');
        const highScoreDisplay = document.getElementById('highScore');
        const guestScoreDisplay = document.getElementById('guestScore');
        const messageOverlay = document.getElementById('messageOverlay');
        const messageText = document.getElementById('messageText');
        const restartButton = document.getElementById('restartButton');
        console.log('Restart Button Element:', restartButton); // <-- ADD THIS LINE
        const signInButton = document.getElementById('signInButton');
        const signUpButton = document.getElementById('signUpButton');
        const saveScoreButton = document.getElementById('saveScoreButton');
        const leaderboardList = document.getElementById('leaderboardList');
        const loadingMessage = document.getElementById('loadingMessage');

        // --- Game Configuration ---
        const fixedCanvasHeight = 250;
        const dinoWidth = 40;
        const dinoHeight = 50;
        const dinoCrouchHeight = 25;
        const dinoCrouchWidth = 45;
        const gravity = 0.6;
        const fastFallGravityMultiplier = 3; // How much faster to fall when down is pressed mid-air
        const jumpStrength = -12;
        const groundHeight = 50;

        // --- Image Loading ---
        const dinoImgStanding = new Image();
        const dinoImgCrouching = new Image();
        const dinoStandingSrc = 'https://placehold.co/40x50/666/eee?text=Dino';
        const dinoCrouchingSrc = 'https://placehold.co/45x25/666/eee?text=Duck';
        const defaultGroundObstacleSrc = 'https://placehold.co/30x40/2a9d8f/eee?text=Obs';
        const defaultFlyingObstacleSrc = 'https://placehold.co/50x30/e76f51/eee?text=Fly';

        const obstacleTypes = [
            { width: 20, height: 40, imgSrc: 'https://placehold.co/20x40/2a9d8f/eee?text=T' },
            { width: 30, height: 30, imgSrc: 'https://placehold.co/30x30/2a9d8f/eee?text=S' },
            { width: 45, height: 50, imgSrc: 'https://placehold.co/45x50/2a9d8f/eee?text=L' },
            { width: 60, height: 35, imgSrc: 'https://placehold.co/60x35/2a9d8f/eee?text=W' },
            { width: 25, height: 55, imgSrc: 'https://placehold.co/25x55/2a9d8f/eee?text=M' }, // Tallest ground obstacle
            { count: 3, width: 15, height: 30, gap: 10, imgSrc: 'https://placehold.co/15x30/2a9d8f/eee?text=3' },
            { width: 50, height: 30, flying: true, yOffset: 35, imgSrc: 'https://placehold.co/50x30/e76f51/eee?text=F1' },
             // ** MODIFIED F2 Obstacle **
            { width: 100, height: 25, flying: true, yOffset: 45, imgSrc: 'https://placehold.co/90x25/e76f51/eee?text=F2-LONG' }, // Longer and higher
        ];
        const obstacleImages = {};

        // --- Obstacle Timing/Speed ---
        const obstacleSpeedStart = 5;
        const obstacleSpawnIntervalStart = 95;
        const obstacleSpawnIntervalMin = 55;
        const spawnIntervalRandomness = 20;
        const speedIncreaseFactor = 0.001;
        const spawnIntervalDecreaseFactor = 0.05;

        // --- Game State ---
        let dinoY, dinoVelocityY;
        let score, highScore;
        let obstacles;
        let frameCount;
        let obstacleSpeed;
        let currentBaseSpawnInterval;
        let nextObstacleFrame;
        let isGameOver;
        let gameStarted = false;
        let isLoggedIn = false;
        let isCrouching = false;
        let isFastFalling = false; // ** NEW: Track fast fall state **
        let assetsLoaded = false;

        // --- Asset Preloading Function ---
        function preloadAssets() {
            const promises = [];
            const sourcesToLoad = new Set([dinoStandingSrc, dinoCrouchingSrc]);
            obstacleTypes.forEach(type => sourcesToLoad.add(type.imgSrc)); // Add all obstacle sources
            sourcesToLoad.forEach(src => {
                promises.push(new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        if (src === dinoStandingSrc) dinoImgStanding.src = src;
                        else if (src === dinoCrouchingSrc) dinoImgCrouching.src = src;
                        else obstacleImages[src] = img; // Store by src
                        resolve();
                    };
                    img.onerror = () => { console.error(`Failed to load image: ${src}`); resolve(); };
                    img.src = src;
                     // Assign src immediately for potential early draw calls
                     if (src === dinoStandingSrc) dinoImgStanding.src = src;
                     if (src === dinoCrouchingSrc) dinoImgCrouching.src = src;
                }));
            });
            return Promise.all(promises);
        }


        // --- Dino Object ---
        const dino = {
            x: 50,
            getCurrentWidth() { return isCrouching ? dinoCrouchWidth : dinoWidth; },
            getCurrentHeight() { return isCrouching ? dinoCrouchHeight : dinoHeight; },
            draw() {
                const currentHeight = this.getCurrentHeight();
                const currentWidth = this.getCurrentWidth();
                const currentY = isCrouching ? canvas.height - currentHeight - groundHeight : dinoY;
                const imgToDraw = isCrouching ? dinoImgCrouching : dinoImgStanding;
                if (imgToDraw && imgToDraw.complete && imgToDraw.naturalWidth > 0) {
                    ctx.drawImage(imgToDraw, this.x, currentY, currentWidth, currentHeight);
                } else {
                    ctx.fillStyle = '#666';
                    ctx.fillRect(this.x, currentY, currentWidth, currentHeight);
                }
            },
            jump() {
                if (!isCrouching && dinoY >= canvas.height - this.getCurrentHeight() - groundHeight - 1) {
                    dinoVelocityY = jumpStrength;
                    isFastFalling = false; // Reset fast fall on jump
                }
            },
            update() {
                // Apply gravity - increase if fast falling
                const currentGravity = isFastFalling ? gravity * fastFallGravityMultiplier : gravity;

                // Apply gravity only if not crouching on the ground
                if (!isCrouching || dinoY < canvas.height - this.getCurrentHeight() - groundHeight) {
                    dinoVelocityY += currentGravity;
                    dinoY += dinoVelocityY;
                }

                const currentHeight = this.getCurrentHeight();
                // Ground collision
                if (dinoY > canvas.height - currentHeight - groundHeight) {
                    dinoY = canvas.height - currentHeight - groundHeight;
                    dinoVelocityY = 0;
                    isFastFalling = false; // Stop fast fall on ground hit
                    // If down key is still held, stay crouched
                    // isCrouching = ??? // Handled by keyup/keydown
                }
                // Ceiling collision (optional)
                if (dinoY < 0) {
                    dinoY = 0;
                    dinoVelocityY = 0; // Stop upward movement if hitting ceiling
                }
            },
            // ** MODIFIED: Handle Crouch / Fast Fall trigger **
            handleDownAction() {
                // Check if dino is in the air (not on the ground)
                 if (dinoY < canvas.height - this.getCurrentHeight() - groundHeight - 1) {
                    // If in air and not already fast falling, initiate fast fall
                    if (!isFastFalling) {
                         isFastFalling = true;
                         // Optional: Give a small initial downward boost
                         // dinoVelocityY = Math.max(dinoVelocityY, 1); // Ensure some downward speed
                    }
                 } else {
                     // If on the ground, start crouching (if not already)
                     if (!isCrouching) {
                        isCrouching = true;
                        isFastFalling = false; // Cannot be fast falling if starting crouch
                     }
                 }
            },
            // ** MODIFIED: Handle stopping crouch / fast fall **
            handleUpAction() {
                 // Stop crouching if currently crouching
                 if (isCrouching) {
                    isCrouching = false;
                 }
                 // Always stop fast falling when down arrow is released
                 isFastFalling = false;
            }
        };

        // --- Obstacle Functions ---
        function createObstacle() { /* ... (no changes needed here) ... */
            const typeIndex = Math.floor(Math.random() * obstacleTypes.length);
            const selectedType = obstacleTypes[typeIndex];
            const count = selectedType.count || 1;
            const width = selectedType.width;
            const height = selectedType.height;
            const gap = selectedType.gap || 0;
            const isFlying = selectedType.flying || false;
            const yOffset = selectedType.yOffset || 0;
            const imgSrc = selectedType.imgSrc;
            let obstacleY;
            if (isFlying) {
                obstacleY = canvas.height - groundHeight - height - yOffset;
                obstacleY = Math.max(0, obstacleY);
            } else {
                obstacleY = canvas.height - height - groundHeight;
            }
            const img = obstacleImages[imgSrc];
            for (let i = 0; i < count; i++) {
                const obstacleX = canvas.width + i * (width + gap);
                obstacles.push({ x: obstacleX, y: obstacleY, width: width, height: height, isFlying: isFlying, img: img, imgSrc: imgSrc });
            }
        }

        function updateObstacles() { /* ... (no changes needed here) ... */
            const currentDinoHeight = dino.getCurrentHeight();
            const currentDinoWidth = dino.getCurrentWidth();
            const currentDinoY = isCrouching ? canvas.height - currentDinoHeight - groundHeight : dinoY;
            for (let i = obstacles.length - 1; i >= 0; i--) {
                const obs = obstacles[i];
                obs.x -= obstacleSpeed;
                if (obs.img && obs.img.complete && obs.img.naturalWidth > 0) {
                     const drawWidth = obs.width * 1.1; const drawHeight = obs.height * 1.1;
                     const drawX = obs.x - (drawWidth - obs.width) / 2; const drawY = obs.y - (drawHeight - obs.height) / 2;
                     ctx.drawImage(obs.img, drawX, drawY, drawWidth, drawHeight);
                } else {
                    ctx.fillStyle = obs.isFlying ? '#888' : '#2a9d8f';
                    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
                }
                if ( dino.x < obs.x + obs.width && dino.x + currentDinoWidth > obs.x && currentDinoY < obs.y + obs.height && currentDinoY + currentDinoHeight > obs.y ) {
                    gameOver(); return;
                }
                if (obs.x + obs.width < 0) { obstacles.splice(i, 1); }
            }
        }

        // --- Game Loop ---
        function gameLoop() { /* ... (no changes needed here) ... */
            if (isGameOver || !assetsLoaded) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            dino.update();
            dino.draw();
            if (frameCount >= nextObstacleFrame) {
                createObstacle();
                currentBaseSpawnInterval = Math.max(obstacleSpawnIntervalMin, currentBaseSpawnInterval - spawnIntervalDecreaseFactor);
                const randomOffset = (Math.random() - 0.5) * 2 * spawnIntervalRandomness;
                const nextInterval = Math.floor(currentBaseSpawnInterval + randomOffset);
                const clampedInterval = Math.max(obstacleSpawnIntervalMin * 0.6, nextInterval);
                nextObstacleFrame = frameCount + clampedInterval;
            }
            updateObstacles();
            score++;
            scoreDisplay.textContent = score;
            obstacleSpeed += speedIncreaseFactor;
            frameCount++;
            requestAnimationFrame(gameLoop);
        }

        // --- Game State Functions ---
         function resizeCanvas() { /* ... (no changes needed here) ... */
            const container = canvas.parentElement;
            const newWidth = container.clientWidth;
            canvas.width = newWidth;
            canvas.height = fixedCanvasHeight;
            if (!assetsLoaded) { drawLoadingScreen(); return; }
            if (gameStarted && !isGameOver) {
                 dinoY = canvas.height - dino.getCurrentHeight() - groundHeight;
                 obstacles.forEach(obs => {
                     if (obs.isFlying) {
                         const type = obstacleTypes.find(t => t.imgSrc === obs.imgSrc);
                         const yOffset = type?.yOffset || 35;
                         obs.y = canvas.height - groundHeight - obs.height - yOffset;
                         obs.y = Math.max(0, obs.y);
                     } else { obs.y = canvas.height - obs.height - groundHeight; }
                 });
                 ctx.clearRect(0, 0, canvas.width, canvas.height);
                 dino.draw();
                 obstacles.forEach(obs => {
                    if (obs.img && obs.img.complete && obs.img.naturalWidth > 0) {
                         const drawWidth = obs.width * 1.1; const drawHeight = obs.height * 1.1;
                         const drawX = obs.x - (drawWidth - obs.width) / 2; const drawY = obs.y - (drawHeight - obs.height) / 2;
                         ctx.drawImage(obs.img, drawX, drawY, drawWidth, drawHeight);
                    } else { ctx.fillStyle = obs.isFlying ? '#888' : '#2a9d8f'; ctx.fillRect(obs.x, obs.y, obs.width, obs.height); }
                 });
            } else if (!gameStarted) { drawInitialState(); }
            else if (isGameOver) { drawGameOverState(); }
         }

         function drawLoadingScreen() { /* ... (no changes needed here) ... */
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             loadingMessage.style.display = 'block';
             ctx.fillStyle = '#ccc';
             ctx.fillRect(canvas.width * 0.3, canvas.height / 2 - 5, canvas.width * 0.4, 10);
         }

        function drawInitialState() { /* ... (no changes needed here) ... */
            if (!assetsLoaded) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            isCrouching = false; isFastFalling = false; // Reset states
            dinoY = canvas.height - dino.getCurrentHeight() - groundHeight;
            dino.draw();
            ctx.fillStyle = '#555';
            ctx.font = "12px 'Press Start 2P'";
            ctx.textAlign = 'center';
            ctx.fillText("Press SPACE/TAP to Start", canvas.width / 2, canvas.height / 2);
            loadingMessage.style.display = 'none';
        }

        function drawGameOverState() { /* ... (no changes needed here) ... */
             if (!assetsLoaded) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const finalDinoHeight = dino.getCurrentHeight();
            const finalDinoWidth = dino.getCurrentWidth();
            const finalDinoY = isCrouching ? canvas.height - finalDinoHeight - groundHeight : dinoY;
            const imgToDraw = isCrouching ? dinoImgCrouching : dinoImgStanding;
            if (imgToDraw && imgToDraw.complete && imgToDraw.naturalWidth > 0) {
                ctx.drawImage(imgToDraw, dino.x, finalDinoY, finalDinoWidth, finalDinoHeight);
            } else { ctx.fillStyle = '#666'; ctx.fillRect(dino.x, finalDinoY, finalDinoWidth, finalDinoHeight); }
            obstacles.forEach(obs => {
                 let finalObsY;
                 const type = obstacleTypes.find(t => t.imgSrc === obs.imgSrc);
                 if (obs.isFlying) {
                     const yOffset = type?.yOffset || 35;
                     finalObsY = canvas.height - groundHeight - obs.height - yOffset;
                     finalObsY = Math.max(0, finalObsY);
                 } else { finalObsY = canvas.height - obs.height - groundHeight; }
                 if (obs.img && obs.img.complete && obs.img.naturalWidth > 0) {
                     const drawWidth = obs.width * 1.1; const drawHeight = obs.height * 1.1;
                     const drawX = obs.x - (drawWidth - obs.width) / 2; const drawY = finalObsY - (drawHeight - obs.height) / 2;
                     ctx.drawImage(obs.img, drawX, drawY, drawWidth, drawHeight);
                 } else { ctx.fillStyle = obs.isFlying ? '#888' : '#2a9d8f'; ctx.fillRect(obs.x, finalObsY, obs.width, obs.height); }
            });
        }


        function startGame() { /* ... (reset fast fall state) ... */
            if (gameStarted && !isGameOver) return;
            if (!assetsLoaded) { console.log("Assets not loaded yet."); return; }
            score = 0;
            frameCount = 0;
            obstacles = [];
            obstacleSpeed = obstacleSpeedStart;
            currentBaseSpawnInterval = obstacleSpawnIntervalStart;
            const firstRandomOffset = (Math.random() - 0.5) * 2 * spawnIntervalRandomness;
            nextObstacleFrame = Math.floor(currentBaseSpawnInterval + firstRandomOffset);
            isCrouching = false; isFastFalling = false; // Reset states
            dinoY = canvas.height - dino.getCurrentHeight() - groundHeight;
            dinoVelocityY = 0;
            isGameOver = false;
            gameStarted = true;
            scoreDisplay.textContent = score;
            guestScoreDisplay.textContent = score;
            messageOverlay.classList.remove('visible');
            saveScoreButton.classList.add('hidden');
            loadingMessage.style.display = 'none';
            highScore = localStorage.getItem('dinoHighScore') || 0;
            highScoreDisplay.textContent = highScore;
            gameLoop();
        }

        function gameOver() { /* ... (no changes needed here) ... */
            isGameOver = true;
            isFastFalling = false; // Stop fast fall on game over
            if (score > highScore) { highScore = score; localStorage.setItem('dinoHighScore', highScore); highScoreDisplay.textContent = highScore; }
            guestScoreDisplay.textContent = score;
            messageText.textContent = `Game Over! Score: ${score}`;
            drawGameOverState();
            messageOverlay.classList.add('visible');
            if (isLoggedIn) { saveScoreButton.classList.remove('hidden'); } else { saveScoreButton.classList.add('hidden'); }
        }

        // --- Placeholder Functions for Backend Interaction ---
        /* ... (no changes needed here) ... */
        function handleSignIn() { console.log("Sign In button clicked - Placeholder"); isLoggedIn = true; alert("Placeholder: You are now 'signed in'. If you get a game over, you'll see the option to save your score."); signInButton.textContent = "Sign Out"; signUpButton.style.display = 'none'; saveScoreButton.classList.add('hidden'); fetchLeaderboard(); }
        function handleSignOut() { console.log("Sign Out button clicked - Placeholder"); isLoggedIn = false; alert("Placeholder: You have been 'signed out'."); signInButton.textContent = "Sign In"; signUpButton.style.display = 'inline-block'; saveScoreButton.classList.add('hidden'); loadDummyLeaderboard(); }
        function handleSignUp() { console.log("Sign Up button clicked - Placeholder"); alert("Placeholder: Sign Up functionality not implemented."); }
        function saveHighScore(currentScore) { if (!isLoggedIn) { console.log("User not logged in."); alert("Please sign in to save your score!"); saveScoreButton.classList.add('hidden'); return; } console.log(`Placeholder: Attempting to save score ${currentScore}...`); alert(`Placeholder: Score ${currentScore} would be saved.`); saveScoreButton.classList.add('hidden'); fetchLeaderboard(); }
        function fetchLeaderboard() { console.log("Placeholder: Fetching leaderboard..."); const localHighScore = localStorage.getItem('dinoHighScore') || 0; const dummyData = [ { name: 'ServerPlayer1', score: 2100 }, { name: 'ServerPlayer2', score: 1850 }, { name: 'TopDino', score: 1700 }, ...(isLoggedIn && localHighScore > 0 ? [{ name: 'You', score: localHighScore }] : []), ].sort((a, b) => b.score - a.score); renderLeaderboard(dummyData); }
        function loadDummyLeaderboard() { const localHighScore = localStorage.getItem('dinoHighScore') || 0; const dummyData = [ { name: 'Player1', score: 1500 }, { name: 'Player2', score: 1250 }, { name: 'Player3', score: 1100 }, { name: 'You (Guest)', score: localHighScore }, ].sort((a, b) => b.score - a.score); renderLeaderboard(dummyData); }
        function renderLeaderboard(data) { leaderboardList.innerHTML = ''; if (!data || data.length === 0) { leaderboardList.innerHTML = '<li>No scores yet!</li>'; return; } const filteredData = isLoggedIn ? data.filter(entry => entry.name !== 'You (Guest)') : data; filteredData.forEach(entry => { const li = document.createElement('li'); const nameSpan = document.createElement('span'); const scoreSpan = document.createElement('span'); nameSpan.textContent = entry.name; scoreSpan.textContent = entry.score; li.appendChild(nameSpan); li.appendChild(scoreSpan); leaderboardList.appendChild(li); }); }


        // --- Event Listeners ---
        document.addEventListener('keydown', (e) => {
            if (isGameOver) { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); startGame(); } return; }
            if (!assetsLoaded) return;
            switch (e.code) {
                case 'Space': case 'ArrowUp': e.preventDefault(); if (!gameStarted) startGame(); else dino.jump(); break;
                // ** MODIFIED: Call handleDownAction **
                case 'ArrowDown': e.preventDefault(); if (gameStarted) dino.handleDownAction(); break;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (isGameOver || !assetsLoaded) return;
             // ** MODIFIED: Call handleUpAction **
            if (e.code === 'ArrowDown') {
                e.preventDefault();
                 if (gameStarted) dino.handleUpAction();
            }
        });

         canvas.addEventListener('touchstart', (e) => {
             e.preventDefault();
             if (!assetsLoaded) return;
             if (!gameStarted) startGame();
             else if (!isGameOver) dino.jump();
             else startGame();
         }, { passive: false });
         messageOverlay.addEventListener('touchstart', (e) => {
             if (e.target === restartButton) { e.preventDefault(); startGame(); }
             else if (e.target === messageOverlay) { e.preventDefault(); }
         }, { passive: false });
        restartButton.addEventListener('click', () => { if(assetsLoaded) startGame(); });
        window.addEventListener('resize', resizeCanvas);
        signInButton.addEventListener('click', () => { if (isLoggedIn) handleSignOut(); else handleSignIn(); });
        signUpButton.addEventListener('click', handleSignUp);
        saveScoreButton.addEventListener('click', () => saveHighScore(score));

        // --- Initial Setup ---
        preloadAssets().then(() => {
            console.log("Assets loaded!");
            assetsLoaded = true;
            loadingMessage.style.display = 'none';
            resizeCanvas();
            highScore = localStorage.getItem('dinoHighScore') || 0;
            highScoreDisplay.textContent = highScore;
            loadDummyLeaderboard();
        }).catch(error => {
            console.error("Error loading assets:", error);
            loadingMessage.textContent = "Error loading assets. Please refresh.";
            resizeCanvas();
        });
         resizeCanvas();
         drawLoadingScreen();
});