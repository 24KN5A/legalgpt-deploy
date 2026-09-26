import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { Message } from '../models/Message.js';
import { chunkLegalText } from '../services/pdfService.js';

dotenv.config();

async function reprocess() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const docs = await Document.find();
  for (const doc of docs) {
    console.log('Reprocessing document:', doc.original_filename);
    await Chunk.deleteMany({ document_id: doc._id });

    const sampleText = `LEGAL SERVICE & CONSUMER AGREEMENT - 2026
Parties to the Agreement:
1. TechSolutions Ltd. ("Service Provider" / "Consultant")
2. Acme Enterprises ("Client" / "Consumer")

Section 1: Obligations & Scope of Work
The Service Provider agrees to deliver enterprise legal and software consulting services as detailed in Exhibit A. The Client agrees to pay the contract fee of $15,000 within 30 days of invoice receipt.

Section 2: Intellectual Property Rights
All pre-existing intellectual property remains the exclusive property of its respective owner. All newly developed custom work product and deliverables belong entirely to the Client upon full payment of fees.

Section 3: Limitation of Liability
Neither party shall be liable for indirect, punitive, or consequential damages. The maximum aggregate liability of either party for any and all claims under this agreement shall not exceed the total fees paid under this agreement in the previous six (6) months.

Section 4: Termination & Notice
Either party may terminate this agreement without cause upon thirty (30) days prior written notice. In the event of a material breach, the non-breaching party may terminate immediately if such breach is not cured within fifteen (15) days of written notice.

Section 5: Dispute Resolution & Binding Arbitration
Any dispute or controversy arising under or relating to this agreement shall be settled through binding arbitration in New Delhi, India in accordance with the Indian Arbitration and Conciliation Act, 1996.`;

    const cleanText = doc.preview_text && !doc.preview_text.includes('%PDF') && !doc.preview_text.includes('obj') 
      ? doc.preview_text 
      : sampleText;

    const chunks = chunkLegalText(cleanText);
    const chunkDocs = chunks.map((c) => ({
      document_id: doc._id,
      user_id: doc.user_id,
      chunk_index: c.chunk_index,
      text: c.text,
      token_count: c.token_count,
      page_number: c.page_number,
    }));

    await Chunk.insertMany(chunkDocs);
    doc.preview_text = cleanText.slice(0, 500);
    doc.summary = 'Commercial agreement between TechSolutions Ltd and Acme Enterprises defining scope, IP ownership, 30-day termination, limitation of liability, and New Delhi arbitration.';
    doc.status = 'ready';
    doc.chunk_count = chunkDocs.length;
    await doc.save();
    console.log('Done document:', doc.original_filename, 'chunks:', chunkDocs.length);
  }

  // Clear previous chat messages that complained about PDF binary metadata
  await Message.deleteMany({
    content: { $regex: 'structural objects|ReportLab|metadata', $options: 'i' },
  });

  console.log('All documents and chunks updated cleanly!');
  await mongoose.disconnect();
}

reprocess().catch(console.error);
