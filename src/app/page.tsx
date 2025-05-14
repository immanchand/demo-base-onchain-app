'use client';
import Navbar from 'src/components/Navbar';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Button from 'src/components/Button';


export default function Home() {
    

    return (
        <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
            <Navbar />
            <div className="h-[10px]" />
            <section className="flex w-full flex-grow flex-col items-center gap-4 bg-primary-bg px-2 py-4 border-4 border-primary-border">
                
            </section>
        </div>
    );
}
