# **PocketLLM Portal \- Team Project**

## **Overview**

PocketLLM Portal is a lightweight, architecture-first interface for CPU-bound Large Language Models. It demonstrates a robust **streaming architecture** using Server-Sent Events (SSE), **idempotent caching**, and **asynchronous persistence**.

This project implements the "Descriptive Architecture" defined in our design documents, focusing on a meaningful subset of functionality suitable for constrained environments (max 4 vCPUs, 16GB RAM).

## **Architectural Highlights**

* **Architecture Style:** Containerized Three-Tier Client-Server.  
* **Frontend:** React \+ TypeScript \+ Tailwind CSS (Single Page Application).  
* **Backend:** Python FastAPI (Async/Await).  
* **Communication:** Server-Sent Events (SSE) for non-blocking token streaming.  
* **Persistence:** MySQL 8.0 for structured chat history.  
* **Caching:** In-Process LRU Cache (Departure D) for low-latency responses.  
* **Infrastructure:** Fully Dockerized with docker-compose.

## **Prerequisites**

* Docker Desktop (or Docker Engine \+ Compose plugin)  
* No local Python, Node.js, or MySQL installation required.

## **How to Run**

### **1\. Start the Application**

Open a terminal in the root directory (where docker-compose.yml is located) and run:

docker compose up \--build

*Wait for the build to complete. You will see logs indicating the db, api, and web containers have started. The frontend build may take an extra minute to install Node dependencies.*

### **2\. Access the Portal**

* **User Interface:** [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000)  
* **Metrics API:** [http://localhost:8000/metrics](https://www.google.com/search?q=http://localhost:8000/metrics)  
* **API Documentation:** [http://localhost:8000/docs](https://www.google.com/search?q=http://localhost:8000/docs)

### **3\. Stopping / Resetting**

To stop the app:

docker compose down

To **completely reset** the database (useful if you want to clear chat history):

docker compose down \-v

## **Project Structure**

* **frontend/**: The React UI. Handles the connection state and renders the chat stream.  
  * src/services/api.ts: The integration layer implementing the SSE client and HTTP methods.  
  * src/App.tsx: The main application shell and state logic.  
* **backend/**: The REST API.  
  * main.py: Contains the "Mock CPU Runner" (Departure C), Cache Logic, and Database writes.  
* **mysql-init/**: Database schema scripts.  
  * init.sql: Creates the sessions and messages tables automatically on first startup.

## **Verification Steps **

1. **Streaming:** Send a message (e.g., "Hello"). Notice the text arrives token-by-token, simulating the latency of a CPU-bound LLM.  
2. **Caching (Idempotency):** Send the *exact same* message with the same Max Tokens/Temperature parameters. Notice the response is instant (Cache Hit).  
3. **Persistence:** Refresh the browser page. Your previous conversation history is loaded from MySQL.  
4. **Feedback:** Hover over an assistant message and click the Thumbs Up/Down icon. This state is persisted to the DB.  
5. **Observability:** Check http://localhost:8000/metrics to see the cache\_hits and total\_requests counters increment.

## **Departures from Prescriptive Architecture**

As detailed in 2.pdf and realized in the code, this implementation utilizes several departures from the original Assignment 3 design to fit the project constraints:

### **1\. Infrastructure & Backend**

* **In-Memory Caching (Departure D):** Used instead of a dedicated Redis container. This reduces infrastructure overhead and deployment complexity while maintaining the functional requirement of idempotent responses.  
* **Simulated CPU Runner (Departure C):** Replaces the pluggable model engine with a lightweight simulator. This ensures consistent streaming performance on grading hardware without requiring massive (10GB+) model weight downloads, focusing the project on *architectural correctness* over model intelligence.

### **2\. Feature Scope**

* **Simplified Session Management (Departure F1):** Implemented as a reverse-chronological list without pinning, watch lists, or multi-facet filtering.  
* **Minimalist Feedback (Departure F2):** Feedback is limited to simple binary (up/down) voting without complex tagging or automated moderation pipelines.

### **3\. Implementation Patterns**

* **Service Consolidation:** The prescriptive design called for distinct InferService, HistoryService, and AdminService contracts. We consolidated these into a single InferService singleton to reduce boilerplate for this specific capability subset.  
* **State-Based Navigation:** Instead of a full Client-Side Router (e.g., React Router) as originally modeled, the application uses lightweight state-based rendering (sessionId state) to switch contexts. This simplifies the Nginx/Docker configuration by removing the need for history API fallbacks.