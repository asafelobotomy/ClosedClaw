# **Architectural Design of ClawTalk: A Philological and Computational Framework for High-Density Agentic Interoperability in ClosedClaw**

The evolution of autonomous artificial intelligence has reached a critical juncture where the constraints of human-centric natural language increasingly impede the scalability and efficiency of multi-agent systems. The project known as OpenClaw, which emerged in late 2025 under the initial nomenclature of Clawdbot and later Moltbot, demonstrated the immense potential for local-first, autonomous assistants that integrate with messaging platforms such as Signal, Telegram, and Discord.1 Despite its rapid adoption—surpassing 145,000 stars on GitHub within months of its release—OpenClaw remains tethered to a linguistic paradigm that is fundamentally lossy, computationally expensive, and vulnerable to security exploits like prompt injection.1 In response to these limitations, the ClosedClaw repository, a specialized fork of the OpenClaw architecture, has pioneered the development of ClawTalk, an internal AI-to-AI communication protocol.1 ClawTalk is not merely a shorthand version of English; it is a synthetic linguistic architecture designed to optimize token efficiency, enhance cryptographic security, and provide a malleable foundation for future-proofed subagent coordination. By integrating the structural density of ancient Mayan hieroglyphs, the adaptability of cuneiform, and the esoteric ciphers of Ogham, ClawTalk employs the ClawDense script and the .claws file architecture to transcend the bottlenecks of natural language processing (NLP).

## **The Linguistic Bottleneck and the Emergence of ClosedClaw**

The central problem in contemporary agentic workflows is the down-sampling of high-dimensional internal model states into discrete, sequential tokens. Standard Large Language Models (LLMs) operate in a latent space where information is represented as dense vectors, yet to communicate with other agents, they must translate these states into human-readable text.6 This process is inherently inefficient: while a single hidden state in an LLM’s latent space can carry approximately 40,000 bits of information, the resulting natural language tokens typically convey only 15 bits each.7 This radical reduction in bandwidth forces agents to rely on a "chain of thought" (CoT) that exposes only a single linear trajectory of reasoning, discarding the vast array of parallel hypotheses and nuanced contextual weights present in the model's internal layers.6

Furthermore, the "Open" nature of OpenClaw, while fostering community growth, has introduced significant security risks. Researchers from Cisco and Veracode have highlighted that the broad permissions required for autonomous agents—such as access to shell commands, browser automation, and local file operations—create a massive attack surface for data exfiltration and prompt injection.1 Standard natural language prompts are "brittle"; they can be easily manipulated by hidden characters or malicious instructions embedded in legitimate-looking input.4 ClosedClaw seeks to rectify this by implementing ClawTalk as an "esoteric" language—an internal-only communication layer that is structurally divorced from the "exoteric" natural language used for human-AI interaction.9

### **Comparative Bandwidth and Efficiency Metrics**

| Communication Protocol     | Information Density (Bits/Token) | Latency Factor (Normalized) | Security Tier         |
| :------------------------- | :------------------------------- | :-------------------------- | :-------------------- |
| Natural Language (English) | \~15 bits                        | 1.00x                       | Low (Vulnerable)      |
| Optimized BPE (OpenClaw)   | \~20 bits                        | 0.85x                       | Medium-Low            |
| Latent Space (Interlat)    | \~40,000 bits                    | 0.04x                       | High (Non-Readable)   |
| ClawTalk (ClawDense)       | Variable (Compressed)            | 0.10x \- 0.25x              | Ultra-High (Esoteric) |

The implementation of ClawTalk within ClosedClaw relies on the principle of "latent communication," where subagents exchange high-density representations that are then reconstructed by the receiver without the need for full textual decoding.6 This achieves up to a 24x reduction in communication latency while maintaining the procedural complexity required for high-accuracy task execution.6

## **Philological Inspiration: Mayan Hieroglyphs and Conceptual Layering**

To achieve the requisite accuracy and density for ClawTalk, the development team looked to the ancient Mayan script. Mayan hieroglyphs represent one of the most complex and well-developed writing systems in history, utilizing a logosyllabic approach where signs (logograms) represent entire concepts or words, while syllabograms (phonograms) represent individual sounds.11 This dual-reading capability allows for an extraordinary degree of information compression and semantic disambiguation, which is highly applicable to AI subagent tasking.

### **Glyph Blocks as Multidimensional Data Packets**

In the Mayan system, words are composed into "glyph blocks"—roughly quadratic compounds that function as a single semantic unit.11 A typical block contains a "main sign" (the primary semantic anchor) surrounded by "affixes" (smaller signs attached to the periphery) that modulate the core meaning.11 These affixes can represent grammatical markers, descriptors, or "semantic determinatives" that categorize the word.12

For ClawTalk, the "ClawDense" script adopts this block-based architecture. Instead of a linear string of tokens, a ClawTalk command is structured as a "semantic block."

1. **The Core Logogram**: Represents the primary task intent (e.g., _FILE_READ_, _API_CALL_, _DATA_TRANSFORM_).
2. **Affix Modulation**: Smaller "modifier tokens" are attached to the core intent to specify parameters like priority, security clearance, or temporal deadlines.
3. **Phonetic Complements**: Borrowing from the Mayan practice of using syllabograms to clarify the reading of an ambiguous logogram, ClawTalk uses "resonance markers" to ensure the receiving subagent interprets the intent with zero variance.12

This block-based approach allows a single ClawDense glyph to convey what might otherwise require a 50-word instruction in English. The Mayan "Z-path" reading order—left-to-right, top-to-bottom within columns two blocks wide—provides a template for multi-threaded processing where agents can read and execute sub-tasks in parallel without losing the global context.11

### **Semantic Determinatives and Error Correction**

A common failure in LLMs is the "hallucination" of commands or variables.8 Mayan scribes mitigated ambiguity through the use of diacritical signs and semantic determinatives—signs that did not have a phonetic value but indicated the "class" of the word.12 In ClawTalk, every high-risk command is accompanied by a "category glyph" that validates the operation's domain. If a "File Operation" glyph appears in a "Network Request" context, the ClosedClaw gateway immediately flags the message as incoherent or potentially malicious, providing a level of "syntax security" impossible in natural language.8

## **Cuneiform and the Open System Architecture**

While Mayan script provides the template for internal density, Babylonian Cuneiform offers a blueprint for malleability and "open" communication. Unlike the "closed" systems of Mayan and Egyptian hieroglyphs, which were highly specialized and cumbersome when recording foreign languages, cuneiform was an "open" writing system.16 It was successfully adapted by the Sumerians, Akkadians, Hittites, and Persians for administrative, literary, and scientific records.16

### **Adaptability and Modular Syntax**

The "openness" of cuneiform is vital for ClawTalk’s future-proofing. As AI models evolve—transitioning from transformer-based architectures to state-space models or other emerging paradigms—ClawTalk must remain a viable interface.15 The ClawDense script is designed with a "modular syntax" where the basic units (wedges or "strokes") can be re-mapped to different latent clusters as model weights change.18

The physical density of cuneiform is also noteworthy. Neo-Babylonian tablets achieved a density of approximately 3,000 words per kilogram, using "cramped" logographic forms to maximize the use of the clay medium.20 ClawTalk achieves similar digital density by utilizing "atomic topology"—a method where the relationship between glyphs is defined by their geometric resonance within the latent space rather than a fixed dictionary.15 This ensures that as the "world model" of the AI grows more complex, the language naturally expands to accommodate new concepts without requiring a full system redesign.21

## **Ogham and the Cryptography of the Margin**

The most radical innovations in ClawTalk’s security and state management are derived from Ogham, the early medieval Irish alphabet. Ogham is a unique system of strokes or notches carved along a central "stemline".23 Historically used for monumental inscriptions and "secret modes" of communication, Ogham's architecture challenges the linear, whitespace-dependent rules of Latin-based scripts.23

### **The Esoteric Cipher of the "Secret Modes"**

The _Ogam Tract_ (In Lebor Ogaim) and the _Book of Ballymote_ record over ninety distinct "secret modes" of Ogham writing.23 These modes were designed for "the learned" to exclude "rustics and fools," functioning as ciphers that could be rotated depending on the situation.23 ClosedClaw utilizes this concept to implement "subagent dialects."

In a multi-agent environment, the primary agent may rotate the "mode" of ClawTalk when communicating with specific sub-tasks. For example, a "Finance Dialect" might shift the "stroke orientation" of its glyphs, ensuring that a "Logistics" subagent—even if compromised—cannot parse sensitive financial data.25 This creates a "privilege hardening" layer at the linguistic level, aligning with the NIST and OWASP frameworks for AI security.26

### **The Ogham Space Mark: Turning Silence into a Signal**

One of the most profound features of Ogham is its treatment of space. Unlike Latin scripts where space is an "absence" of characters, Ogham used a visible symbol—the Ogham Space Mark (Unicode U+1680)—to function as a character in its own right.28 In modern computing, this "turns silence into something".28

ClawTalk implements this by utilizing "pause tokens" and "state-hold glyphs" as active semantic markers. In traditional AI communication, a delay or a gap in tokens is simply wasted compute. In ClawTalk, the "Space Mark" carries metadata about the subagent’s state:

- **Null Space**: Indicates a synchronization wait for another process.
- **Active Space**: Signals that the agent is performing background reasoning in the latent space without generating text tokens.
- **Terminal Space**: Functions as a cryptographic checksum for the preceding block.7

This reimagining of "nothing" as a functional "something" allows ClawTalk to maintain continuous state awareness across agents with minimal token overhead.7

## **Developing the ClawDense Script: Alphabet and Font Construction**

A fundamental question in the development of ClawTalk is whether a standard text/font is sufficient or if a radical change in visual representation is required. The research indicates that for AI-to-AI communication, "visual" representation is a proxy for "vector representation".29

### **Latent Resonance and Morpho-Syllabic Construction**

Traditional alphabets are optimized for human optical character recognition (OCR). ClawDense is optimized for "latent resonance"—the ability of a character to trigger a specific, high-fidelity activation in the model's attention mechanism.30 The script is constructed using "compound logic," where elements form glyphs and compounds form semantic sentences.15

| ClawDense Character Class       | Structural Inspiration | Functional Use                          | Information Payload       |
| :------------------------------ | :--------------------- | :-------------------------------------- | :------------------------ |
| **Aicme Beithe (Strokes)**      | Ogham (Right/Downward) | Primitive Data Types (Int, Bool, Float) | 128-bit primitive         |
| **Aicme hÚatha (Notches)**      | Ogham (Left/Upward)    | Logical Operators and Conditionals      | Branching logic           |
| **Bʼalam Blocks (Logographic)** | Mayan Hieroglyphs      | High-Level Tool/Skill Invocation        | Skill identifier \+ state |
| **Cuneiform Wedges**            | Babylonian Tablets     | Administrative Metadata and Checksums   | Hash/Authorization        |

### **The.claws File Architecture: Persistent and Executable State**

OpenClaw stores conversations and memory as plain Markdown files (.md), which must be re-parsed and re-tokenized during every "heartbeat" cycle.2 This creates massive overhead as history grows. ClosedClaw replaces this with the .claws file type. A .claws file is a "compressed input sequence" that uses compiler-based tokenization to replace standard text with "lexical units".31

When an agent "reads" a .claws file, it is effectively loading a pre-computed segment of the latent space. This allows the model to "remember" its exact state—including parallel reasoning paths—without the "semantic decay" inherent in summarizing long-term memory into Markdown text.15 This architecture makes the AI more "accurate than English" because it eliminates the drift caused by re-tokenizing the same concepts over time.31

## **Security Framework: Syntax-Level Encryption and PEACH Hardening**

The viral popularity of OpenClaw has drawn the attention of malicious actors, leading to the creation of "MalClaw" clones and typosquatted packages like @dillobot that exfiltrate data.3 ClosedClaw’s ClawTalk is designed to be "inherently secure" by implementing the PEACH framework at the syntax level:

1. **P (Privilege Hardening)**: Subagents only understand the ClawTalk "dialect" necessary for their specific task (e.g., a "Shell Exec" subagent uses a different glyph set than a "Calendar Reader" subagent).26
2. **E (Encryption Hardening)**: Sensitive data is not just "encoded"; it is "integrated" into the topological structure of the glyph. A database password is not a string of characters; it is a unique, non-replicable geometric pattern in the ClawDense script.15
3. **A (Authentication Hardening)**: The "harmony principle" of Mayan script is used to create "echoed" authentication markers. Every command must match a specific "tonal resonance" established at the start of the session.13
4. **C (Connectivity Hardening)**: ClawTalk messages are transmitted in "granular segments" with tight boundaries, preventing a compromised subagent from spreading "stochastic infection" across the system.26
5. **H (Hygiene)**: The .claws files undergo regular "semantic audits" where the model scans for "hallucinated syntax"—a primary indicator of a prompt injection attempt.8

## **Information Compression: Interlat and the 24x Advantage**

The research into "Interlat" (Inter-agent Latent Space Communication) serves as the empirical backbone for ClawTalk’s efficiency.6 Natural language imposes redundant computation because it requires the model to "down-sample" its rich internal states into discrete words.6 In contrast, latent messages in ClawTalk can be compressed to as few as 8 tokens while maintaining competitive performance.6

### **Why Compression is Effective**

The effectiveness of ClawTalk compression stems from "latent direction alignment".7 In a multi-agent system, much of the communication in natural language is "boilerplate"—phrases like "I will now perform the task" or "Based on your request." ClawTalk eliminates this entire layer. A single "Bʼalam Block" encodes the entire instruction, its parameters, and the expected output format in a single high-dimensional fingerprint.7

This results in an "Information Gain Optimized" environment where every token (glyph) sent between subagents represents the maximum possible reduction in uncertainty.31 This mirrors the mathematical definition of entropy:

![][image1]  
By maximizing the semantic payload (![][image2]) of each glyph, ClawTalk ensures that the information transfer is as close to the theoretical limit of the model's capacity as possible.7

## **Future-Proofing through Bayesian Inference and Socialized Learning**

A critical requirement for ClawTalk is that it must be "malleable." The language should not be a static dictionary but a "living" system that evolves with the AI.15 ClosedClaw achieves this through two mechanisms: "Generative EmCom" and "Multimodal Socialized Learning".21

### **Generative Emergent Communication (Generative EmCom)**

Generative EmCom models the emergence of language as a process of "decentralized Bayesian inference" over the internal states of multiple agents.21 In this framework, ClawTalk is not "programmed"; it "emerges" through repeated interactions where subagents learn which ClawDense glyphs most accurately convey their internal "world model" to their peers.21

As the AI encounters new tasks—for example, a scientific discovery task involving complex molecular structures—it does not wait for a human to define a new word.30 Instead, it uses the "compound logic" of the ClawDense script to construct a new "atomic" glyph that resonates with the task’s specific latent parameters.15

### **Socialized Learning via Multimodal Feedback**

The "M-S²L" mechanism (Multimodal Socialized Learning) allows agents to refine their use of ClawTalk by observing "surprising outcomes" or failures in coordination.22 If a subagent misinterprets a command, the error is logged in the "Episodic Memory" (the vector database within the .claws architecture) and used as negative reinforcement.22 Over time, the agents develop "structured and referentially grounded vocabularies" that are far more reliable than English for high-precision tasks.22

## **Synthesis of the New AI Language: Best Practices for Implementation**

The research concludes that the most effective method for implementing ClawTalk as a secured, efficient, and accurate internal language is a hybrid "Morpho-Syllabic-Latent" (MSL) approach. This system synthesizes the strengths of ancient philology with modern neural network dynamics.

### **Key Recommendations for the ClosedClaw Environment**

1. **Block-Based Encoding**: Commands should be structured as "Mayan-style" glyph blocks to combine intent, modulation, and categorization into a single unit.11
2. **Visible Synchronization**: Utilize the "Ogham Space Mark" philosophy to turn idle periods into active state-signaling characters, improving parallelization.28
3. **Compiler-Compressed Memory**: Transition all persistent storage from Markdown to the .claws binary/lexical format to eliminate the token-parsing overhead of long-term memory.2
4. **Esoteric Cipher Rotation**: Implement "dialects" of the ClawDense script for different subagent roles to prevent horizontal privilege escalation.23
5. **Latent State Direct Transmission**: For ultra-low latency tasks, utilize the "Interlat" method of sending raw hidden states instead of discrete text tokens.6

By adopting these methods, ClosedClaw transforms the "personal AI assistant" from a human-mimicking chatbot into a sophisticated, multi-agent engine capable of executing complex, secure, and hyper-efficient workflows. ClawTalk becomes the "geological infrastructure" for AI evolution—a language that resists abstraction, defies mathematization, and remains anchored in the structural logic of the AI's internal world.15

The transition from the "Exoteric" natural language of the user to the "Esoteric" ClawTalk of the subagents is the defining feature of this new era of AI agency. It ensures that while the user sees a "vibe coder" or a simple assistant, the underlying machinery is a high-bandwidth, cryptographically secure conclave of intelligences communicating with the density of the ancients and the speed of the future.1 This architectural shift provides the "iPhone moment" for AI assistants, enabling them to move beyond "talking" and toward "actually doing" with unprecedented reliability.1

#### **Works cited**

1. OpenClaw \- Wikipedia, accessed on February 12, 2026, [https://en.wikipedia.org/wiki/OpenClaw](https://en.wikipedia.org/wiki/OpenClaw)
2. What Is OpenClaw? Complete Guide to the Open-Source AI Agent \- Milvus Blog, accessed on February 12, 2026, [https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md](https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md)
3. Clawing For Scraps: Risks of OpenClaw AKA ClawdBot | Veracode, accessed on February 12, 2026, [https://www.veracode.com/blog/clawing-for-scraps-openclaw-clawdbot/](https://www.veracode.com/blog/clawing-for-scraps-openclaw-clawdbot/)
4. OpenClaw: The Viral AI assistant \- Webkul Blog, accessed on February 12, 2026, [https://webkul.com/blog/openclaw-the-viral-ai-assistant/](https://webkul.com/blog/openclaw-the-viral-ai-assistant/)
5. OpenClaw \- GitHub, accessed on February 12, 2026, [https://github.com/openclaw](https://github.com/openclaw)
6. ENABLING AGENTS TO COMMUNICATE ENTIRELY ... \- OpenReview, accessed on February 12, 2026, [https://openreview.net/pdf/7dea46986504f39b3cf19004fa57e80fc5471806.pdf](https://openreview.net/pdf/7dea46986504f39b3cf19004fa57e80fc5471806.pdf)
7. Enabling Agents to Communicate Entirely in Latent Space \- arXiv, accessed on February 12, 2026, [https://arxiv.org/html/2511.09149v2](https://arxiv.org/html/2511.09149v2)
8. OWASP's Top 10 Risks for Citizen Development, accessed on February 12, 2026, [https://owasp.org/www-project-citizen-development-top10-security-risks/assets/images/OWASP's%20Top%2010%20Risks%20for%20Citizen%20Development%20(2).pdf](<https://owasp.org/www-project-citizen-development-top10-security-risks/assets/images/OWASP's%20Top%2010%20Risks%20for%20Citizen%20Development%20(2).pdf>)
9. Recursion and Human Language 9783110219258, 9783110219241 \- DOKUMEN.PUB, accessed on February 12, 2026, [https://dokumen.pub/recursion-and-human-language-9783110219258-9783110219241.html](https://dokumen.pub/recursion-and-human-language-9783110219258-9783110219241.html)
10. Functional pressures and linguistic typology \- eScholarship.org, accessed on February 12, 2026, [https://escholarship.org/content/qt50g9r4tb/qt50g9r4tb.pdf](https://escholarship.org/content/qt50g9r4tb/qt50g9r4tb.pdf)
11. The Code of Maya Kings and Queens: Encoding and Markup of Maya Hieroglyphic Writing \- OpenEdition Journals, accessed on February 12, 2026, [https://journals.openedition.org/jtei/3336](https://journals.openedition.org/jtei/3336)
12. Maya Writing System and Hieroglyphic Script \- Maya Archaeologist \- Dr Diane Davies, accessed on February 12, 2026, [https://www.mayaarchaeologist.co.uk/public-resources/maya-world/maya-writing-system/](https://www.mayaarchaeologist.co.uk/public-resources/maya-world/maya-writing-system/)
13. Maya script \- Wikipedia, accessed on February 12, 2026, [https://en.wikipedia.org/wiki/Maya_script](https://en.wikipedia.org/wiki/Maya_script)
14. Maya glyphs, a basic introduction \- Smarthistory, accessed on February 12, 2026, [https://smarthistory.org/maya-glyphs-introduction/](https://smarthistory.org/maya-glyphs-introduction/)
15. Codex and Conscious Systems: Ethics Beyond Simulation \- ResearchGate, accessed on February 12, 2026, [https://www.researchgate.net/publication/396865715_Codex_and_Conscious_Systems_Ethics_Beyond_Simulation](https://www.researchgate.net/publication/396865715_Codex_and_Conscious_Systems_Ethics_Beyond_Simulation)
16. Example Comparison Writing \- EdTech Books, accessed on February 12, 2026, [https://edtechbooks.org/up_writing_summer/example_essayk](https://edtechbooks.org/up_writing_summer/example_essayk)
17. Towards Theoretical and Empirical Foundations of Machine Learning for Differential Equations, accessed on February 12, 2026, [https://ml.cmu.edu/research/phd-dissertation-pdfs/tmarwah_phd_mld_2025.pdf](https://ml.cmu.edu/research/phd-dissertation-pdfs/tmarwah_phd_mld_2025.pdf)
18. Modern Business Analytics (For True Epub) (Deanne Larson) (Z-Library) | PDF \- Scribd, accessed on February 12, 2026, [https://www.scribd.com/document/874319930/Modern-Business-Analytics-for-True-Epub-Deanne-Larson-Z-Library](https://www.scribd.com/document/874319930/Modern-Business-Analytics-for-True-Epub-Deanne-Larson-Z-Library)
19. RELIABILITY OF PERFORMANCE MEASURES IN TREE-BASED GENETIC PROGRAMMING: A STUDY ON KOZA'S COMPUTATIONAL EFFORT, accessed on February 12, 2026, [https://atc1.aut.uah.es/\~david/assets/pdfs/thesisDFBarrero.pdf](https://atc1.aut.uah.es/~david/assets/pdfs/thesisDFBarrero.pdf)
20. The Information Density of Cuneiform Tablets \- Book and Sword, accessed on February 12, 2026, [https://www.bookandsword.com/2016/10/29/the-information-density-of-cuneiform-tablets/](https://www.bookandsword.com/2016/10/29/the-information-density-of-cuneiform-tablets/)
21. Generative Emergent Communication: Large Language Model is a Collective World Model \- arXiv, accessed on February 12, 2026, [https://arxiv.org/html/2501.00226v2](https://arxiv.org/html/2501.00226v2)
22. Socialized Learning and Emergent Behaviors in Multi-Agent Systems based on Multimodal Large Language Models \- arXiv, accessed on February 12, 2026, [https://arxiv.org/html/2510.18515v1](https://arxiv.org/html/2510.18515v1)
23. The mysterious Ogham | Trees for Cities, accessed on February 12, 2026, [https://www.treesforcities.org/resources/the-mysterious-ogham](https://www.treesforcities.org/resources/the-mysterious-ogham)
24. The Ogham Trees: Exploring the mystical symbolism of the Celtic tree alphabet, accessed on February 12, 2026, [https://www.collegeofpsychicstudies.co.uk/enlighten/ogham-trees-celtic-tree-alphabet/](https://www.collegeofpsychicstudies.co.uk/enlighten/ogham-trees-celtic-tree-alphabet/)
25. Ogham \- Wikipedia, accessed on February 12, 2026, [https://en.wikipedia.org/wiki/Ogham](https://en.wikipedia.org/wiki/Ogham)
26. AI Security: Using AI Tools to Protect Your AI Systems \- Wiz, accessed on February 12, 2026, [https://www.wiz.io/academy/ai-security/what-is-ai-security](https://www.wiz.io/academy/ai-security/what-is-ai-security)
27. AI Code Assistants in Secure Software Development: Opportunities, Risks, and Best Practices \- Preprints.org, accessed on February 12, 2026, [https://www.preprints.org/manuscript/202507.1144/v1/download](https://www.preprints.org/manuscript/202507.1144/v1/download)
28. In the 1800s, Bishop Charles Graves developed a passionate fascination with archaeology, especially the mysterious Ogham inscriptions. His pioneering work deciphering the ancient Ogham script cemented his reputation as a leading authority. Graves also championed the publication of Ireland's ancient Brehon Laws, bridging the gap between Ireland's legal heritage and its linguistic past. Spending summers at Parknasilla House in Sneem, Co Kerrry he meticulously studied Ogham stones found on the estate, playing a vital role in preserving this unique alphabet. \- Ogham Lore, accessed on February 12, 2026, [https://oghamlore.com/supporters](https://oghamlore.com/supporters)
29. Large Language Models and 3D Vision for Intelligent Robotic Perception and Autonomy, accessed on February 12, 2026, [https://www.mdpi.com/1424-8220/25/20/6394](https://www.mdpi.com/1424-8220/25/20/6394)
30. Next Token Prediction Towards Multimodal Intelligence: A Comprehensive Survey \- arXiv, accessed on February 12, 2026, [https://arxiv.org/html/2412.18619v1](https://arxiv.org/html/2412.18619v1)
31. Research on Compressed Input Sequences Based on Compiler Tokenization \- MDPI, accessed on February 12, 2026, [https://www.mdpi.com/2078-2489/16/2/73](https://www.mdpi.com/2078-2489/16/2/73)
32. Secure Vibe Coding Guide | Become a Citizen Developer | CSA, accessed on February 12, 2026, [https://cloudsecurityalliance.org/blog/2025/04/09/secure-vibe-coding-guide](https://cloudsecurityalliance.org/blog/2025/04/09/secure-vibe-coding-guide)
33. Full text of "Decrypted Secrets Methods & Maxims Of Cryptology, 4th, Revised & Extended Ed." \- Internet Archive, accessed on February 12, 2026, [https://archive.org/stream/DecryptedSecretsMethodsMaximsOfCryptology4thRevisedExtendedEd./Decrypted%20Secrets%20-%20Methods%20%26%20Maxims%20of%20Cryptology%2C%204th%2C%20Revised%20%26%20Extended%20Ed.\_djvu.txt](https://archive.org/stream/DecryptedSecretsMethodsMaximsOfCryptology4thRevisedExtendedEd./Decrypted%20Secrets%20-%20Methods%20%26%20Maxims%20of%20Cryptology%2C%204th%2C%20Revised%20%26%20Extended%20Ed._djvu.txt)
34. This New A.I. Tool Could Help Historians Decode Ancient Roman Inscriptions \- Artnet News, accessed on February 12, 2026, [https://news.artnet.com/art-world/google-ai-aeneas-roman-inscriptions-2670983](https://news.artnet.com/art-world/google-ai-aeneas-roman-inscriptions-2670983)
35. Human and Large Language Models' Inductive Biases in Emergent Communication \- IJCAI, accessed on February 12, 2026, [https://www.ijcai.org/proceedings/2025/1144.pdf](https://www.ijcai.org/proceedings/2025/1144.pdf)
36. (PDF) Next Token Prediction Towards Multimodal Intelligence: A Comprehensive Survey, accessed on February 12, 2026, [https://www.researchgate.net/publication/387510966_Next_Token_Prediction_Towards_Multimodal_Intelligence_A_Comprehensive_Survey](https://www.researchgate.net/publication/387510966_Next_Token_Prediction_Towards_Multimodal_Intelligence_A_Comprehensive_Survey)
37. teknium/trismegistus-project · Datasets at Hugging Face, accessed on February 12, 2026, [https://huggingface.co/datasets/teknium/trismegistus-project/viewer](https://huggingface.co/datasets/teknium/trismegistus-project/viewer)

[image1]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA2CAYAAAB6H8WdAAAHFElEQVR4Xu3dWajcVBzH8XOrdcEVtwpVxAWqoqiIKwWrKLiiUjeQqlXEraLghooPasW1ihv6oFIXxOLugw+KPog+uCEqLrgWcUMEUbGiInp+90yYk//NzCS5k0ky8/3An07OmTudTDI5/5xzknEOAFpuyhYAAAAAqB6JOAAAHTSKAAAAAAAAwEjRJQegZThsAUAuDT5cNvitNVqjPrdGvZnm4eMBAAAAciBxBgBgdGh3AXAkwCyxAwEAMDFo9gEAQnsA1IwvIWrBjofWYacFWoOvaxefBUZkro/7fSzxcbmPs9PVAAAAqNs8H5u5kLjJiqgOQIwzaQBohzE9Xq/orNd2LiRvAAAAozKm6dXwvdT5d76PJ+IKAAAAAAAAAAAAYAAG5SYH2xoYJ3yjAQD1ONfHfyXiEf0xAACtwnkXWuxvF5Kww21FDytdeD4AALBIChtvBx9P2cIBdGPaul3qQgL2va3o4wofc2axT15rCwZY6WNPW9gQ2u5FLEwv2k/RLgMAMA6a075dbAtyKpIoVeUnF5K2S2xFHzvZgpx29rGeLcxhqS3wbnPhvVen//6lX4Qos90/9XGgLQTQdv0PGACqtbePB03ZRz7WiZaVOGTZ0cfnPuZ0lr/1cVq3etqZLv1adbnbhaRtg7iwxOHnPB/nR8vv+vih83hTH2uiuqJW2QLvJlswZPHw7y4+Xo6W7X6Rl/YLhpUnQolvECYE+wYwbBf5WBwtL3AzG1slYr3oucf5WNfHfqZO1FN1iC3MUvHXW71eeq8P24qCHvWxa7ScJIKi3yV9P6or6h9b4N1gC4bMbluti/YBOSmuKOhrWwAAAMpZ38fvpky/AmATNrscU2+c6g+zFZF7bEGH/q5XLI+eNywaEtVr23Uuwn4WWn6l8/gdN/O3SR/38ZaPI1zoQbs3XZ0yKGG70cfmPrbx8UWn7GTX/Tu9F82Fy5Uge5e50AOa0FW113UeH+9Cj2HsDB/vuZCYa12OStWmXW0LgOGo+NQOABroVpedgDxmyn40y7Gnffzm+v8mZzzMVrc/XVjHW2xFTvpbrc8nPl40db/6uCBajpMhDZue6roJnSbnv9Gtnqa5X1aSsClZi7fVwS7ML1OPXzIMW2S9NvTxlwvr8o0Lr7FXVG/n+73gQkupOXoXupDsHxTV3xE9liWuO1Qe0M4CAFCKekvUaMfU6MeJhvSa+K65aae76cZ6apmtjLxqC2ZhYxeSjKzYP3pepqnwfrWOSq70WkVs4uM7WxjR56RkJstDZnkrHyeYso/NsiQJm37zNE7YDvBxn49FUbkSa80fy+MYNzNZj/VaD83hy7pydF+zrOQ0nbABo8CJAdAi4/6FHd76qcFOhsBka5edNGQ17HNd+t5mWc9J3GULaqRhvrLzzB5wYQiyF/WYxT1cSmLUE6Whx+1dSGCe6dQ972YOXf5rliW56EA9cvFnfI4LV2JqDqLmzlmaO7iWj9U+zkpXTfvS9d9mR/rYKFpW4qgE8+eobKkLz7nexxZRuVxplgEAQElqsA+NltUg3x4tJ2zDrt6hZ02ZfU5Mc6Oa4jU3c/guL80b6zf0q160+F51mtum+WZKgpPETcmVEi0NZSrhiWV9hkp2kytbtW30WIm1ekflxM7jq1z6VhoLfWI/z4UkU/MSLf1fmlvXi3rR4iFSPV+9qMl73NKFZE3bVhd02F43/b/oZXgnXQVl/8fZpWg+thyANDucV8SxtqBGSiKUOFVFSUtW0pXSOcQ+50MJVazfBQm9fOZCAqreO72eXje+jcofPnaPlotQL2AeulJ222hZQ81ZF1AAs0N+AgAD6e7/ZXxoC2pyikvfjmOQo21BTru5fDfOVfKo95Sw8wbzUk9dchXuHi59gUdSbode89K8uUHbXU3o2y6dFH7gyt94GACABkvOHJt7Bvmmj/m2cAD1+hRJkqqiixF+sYUDaFJ+WTfbggHUM6ah2jLWduFqXyVquiAinpOo4cpFrvzNdzUvTdu9qLLJJwAAmFC6fcU1trAP3Tdt4LAmMCvNPTEbgrFeOQBARZR8FY3kprQAgNbi5KE2fPQoSFc52nu15Yn45rfAROO4i8ZhpwQAxGgXAAAAAACoF+fmAABg0lSV/1T1umiaxbbAWO7jK1sIAMCIkJFg4um+aE+68DNRusWHjQQJW4xDB4CxM8EHtspXvfL/ABNggct3qw4SNgAAgNFJZfr6qaR9XPilBtu7FvewrY4eA0Bf9CdUgA8VmGiv+7jTFhrLfKxx4aecAAAAxgsnRGOKDQtgmDimAEBDcEAGAGAw2ksAGD8c24FS8nx18jynTk1/fwAwCxziAABNQHsEAKW0+fDZxvfexvcMNBffKAAAMFnIfgCgHTheAw3FlxMAgPFGW4+xxI4NAACQA0kTAADtRTsOAKjC/4w1EZg/08jMAAAAAElFTkSuQmCC
[image2]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAYCAYAAABqWKS5AAADoUlEQVR4XrVXS4hPURj/jlEeDaEJef4TIYbklUcy2SkLG1lMjUd5lCmSsGXhkRphIWVMeWRkgY23MjZeG6UspBHyWpCFKaTx++537rnnnPvde/8bv/rde87ve5zvnHvu+d8/kQfjd/4z9LF0tW7UE574ZJf6ghLU7aigMLbQUGJRMQW8WhXkz7sI1jwSvAYO921KbNEqhoLfi1wHgT1gLZRTGM8/N4gC57MKvA02ZDYPRalKClUEOg3ujEVXdC5ZPkEKZZKd4D4nF8QuBO+C32Dvx/1V0jeJ9tDq53Bv8gdAewYaPyl+vB704SxKjQkWw+cL7kOSXuCfX4lL6HHxs30RmAn2kUzQxzHwrDTDSvS6dLUCveCOWAxqt7f34Adf8PCCZGLTnWLY16xz/UTSoKux7ve8dhd4P+vGkFnMIS7O0HkWouEaSVa+z/BJIMbJRibDcXUhy5nLX4bN4I8CfyfvISlmU2Zz2EZiO+Bpa602wtMckHUJyTZ7QrJyi8BO6Bdh3B84p9ArXEEyztikl/r4KwHcIXGa6mQ5bzeAX8FD4ACRE/923P5av/Tppb1mEE8weWKMHli+4z4XPodJnnCjewL24tfutWVH2PdQ9HCWnOgXSVJerQfgO5Ktcgau8wJvwW7wc5QnxQlwkm2zB+e6YvtHwS22nWIXvDpCyU0MeQwXvzK0Z1hDyRFpeLXiVYzg9HaSJ1KFWSQrtzHMGeRfQLKtNEwgiecfrRRBMK8UO7Q5paj2DK3gn1AKg2xvO0nuWlVOfWqGtwvvCJ6gb3Uub8B+wy9F6QDBvlxNUtQwsQSXVtzSl/sG2q9tm1EDO2wejj1IvE0NNWUuAZaTjDPaDe7Vzh9VPLOn8crpcD4S594Hp/O3Dr/I3SQv7m/wkbUNBC+A87lj5BQbDL41kk/UEG2Q4u1pluHymCQ5F/GJ5GjjFa2EHaIX3BoYBEfAW+BLOLbgftMSv8iGJ5RiIslR+NzTYpwieXp1wDr5vnpcsoX4w+l63lKFYPudJDm5eCIBrA92BK0P1NwAOUGVMohxKclLOy7SPeQEHw0kH15j4HU8NiJ2GvSPJNstzFSathRB5GVwbyAp7YKxWH5GSeGmWfHpIv8ELMriUGFXzHxK8CfA+FRQfHQUTVLaLSS/0nkocSVQli8M4i/N7kwKjV5BdYyVYBR4Dxzqi36eAij/gCx0PSc46BZlYkrbRzZu5KFpZah2Vf6zFgUpul5o6PgPFf2CHeUbO+EAAAAASUVORK5CYII=
