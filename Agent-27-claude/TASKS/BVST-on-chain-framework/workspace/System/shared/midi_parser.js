export class MidiParser {
    static parse(arrayBuffer) {
        const data = new DataView(arrayBuffer);
        let p = 0;

        // Header Chunk
        const headerId = this.readString(data, p, 4); p += 4;
        if (headerId !== 'MThd') throw new Error('Invalid MIDI header');
        const headerLen = data.getUint32(p); p += 4;
        const format = data.getUint16(p); p += 2;
        const nTracks = data.getUint16(p); p += 2;
        const timeDivision = data.getUint16(p); p += 2; // Ticks per beat

        const events = [];

        // Track Chunks
        for (let t = 0; t < nTracks; t++) {
            const trackId = this.readString(data, p, 4); p += 4;
            if (trackId !== 'MTrk') throw new Error('Invalid Track header');
            const trackLen = data.getUint32(p); p += 4;
            const end = p + trackLen;
            
            let ticks = 0;
            let lastStatus = 0;

            while (p < end) {
                // Delta Time (Variable Length)
                let delta = 0;
                let shift = 0;
                while (true) {
                    if (p >= data.byteLength) break;
                    const b = data.getUint8(p++);
                    delta = (delta << 7) | (b & 0x7F); // Big-endian shift for VLQ?
                    // VLQ is 7-bit per byte.
                    // Correct logic:
                    // val = 0; while... val = (val << 7) | (byte & 0x7f); if !(byte & 0x80) break;
                    if ((b & 0x80) === 0) break;
                }
                ticks += delta;

                if (p >= data.byteLength) break;

                // Event
                let status = data.getUint8(p);
                if (status >= 0x80) {
                    lastStatus = status;
                    p++;
                } else {
                    status = lastStatus; // Running status
                }

                const type = status >> 4;
                const channel = status & 0x0F;

                if (type === 0x8 || type === 0x9) { // Note Off / On
                    const note = data.getUint8(p++);
                    const vel = data.getUint8(p++);
                    const isNoteOn = (type === 0x9 && vel > 0);
                    
                    events.push({
                        type: isNoteOn ? 'note_on' : 'note_off',
                        note: note,
                        velocity: vel / 127.0,
                        ticks: ticks,
                        channel: channel
                    });
                } else if (type === 0xB) { // CC
                    const ctrl = data.getUint8(p++);
                    const val = data.getUint8(p++);
                    events.push({ type: 'cc', ctrl, val, ticks });
                } else if (status === 0xFF) { // Meta
                    const metaType = data.getUint8(p++);
                    // Var length size
                    let len = 0;
                    while (true) {
                        const b = data.getUint8(p++);
                        len = (len << 7) | (b & 0x7F);
                        if ((b & 0x80) === 0) break;
                    }
                    if (metaType === 0x51) { // Tempo
                        // 3 bytes microseconds per quarter note
                        // Not processing tempo changes yet, assuming 120 or extracting first?
                    }
                    p += len;
                } else if (status >= 0xF0) {
                    // Sysex or other system
                    // Skip... complex
                    // For now, let's assume standard MIDI file and maybe break if complex.
                    // Simple skip:
                    while (true) {
                         const b = data.getUint8(p++);
                         if (b === 0xF7) break;
                    }
                } else {
                    // Channel events with 1 data byte
                    if(type === 0xC || type === 0xD) p+=1;
                    // Channel events with 2 data bytes
                    if(type === 0xE) p+=2;
                }
            }
        }
        
        events.sort((a,b) => a.ticks - b.ticks);
        return { timeDivision, events };
    }

    static readString(view, offset, len) {
        let s = '';
        for(let i=0; i<len; i++) s += String.fromCharCode(view.getUint8(offset+i));
        return s;
    }
}
