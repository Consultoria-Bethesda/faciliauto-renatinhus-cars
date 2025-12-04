/**
 * Seed Script for Lead Dashboard
 * 
 * Creates initial dealership, admin, seller, and partner users.
 * Updates existing vehicles and leads with dealershipId.
 * 
 * Run with: npx tsx src/scripts/seed-dashboard.ts
 * 
 * _Requirements: 1.1, 1.5, 10.1_
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../services/auth.service';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding dashboard data...\n');

    // 1. Create Dealership
    console.log('📍 Creating dealership...');
    const dealership = await prisma.dealership.upsert({
        where: { cnpj: '12.345.678/0001-90' },
        update: {},
        create: {
            name: "Renatinhu's Cars",
            cnpj: '12.345.678/0001-90',
            websiteUrl: 'https://www.renatinhuscars.com.br/',
            logoUrl: '/logo.svg',
            sellerWhatsApp: '5511999999999',
            isActive: true,
            commissionType: 'percentage',
            commissionRate: 2.0,
        },
    });
    console.log(`   ✅ Dealership: ${dealership.name} (${dealership.id})`);

    // 2. Create Users
    console.log('\n👤 Creating users...');

    // Admin user
    const adminPassword = await hashPassword('admin123');
    const admin = await prisma.user.upsert({
        where: { email: 'admin@faciliauto.com' },
        update: { passwordHash: adminPassword },
        create: {
            email: 'admin@faciliauto.com',
            passwordHash: adminPassword,
            name: 'Administrador',
            role: 'admin',
            isActive: true,
        },
    });
    console.log(`   ✅ Admin: ${admin.email}`);

    // Seller user (linked to dealership)
    const sellerPassword = await hashPassword('seller123');
    const seller = await prisma.user.upsert({
        where: { email: 'vendedor@renatinhuscars.com' },
        update: { passwordHash: sellerPassword },
        create: {
            email: 'vendedor@renatinhuscars.com',
            passwordHash: sellerPassword,
            name: 'João Vendedor',
            role: 'seller',
            dealershipId: dealership.id,
            isActive: true,
        },
    });
    console.log(`   ✅ Seller: ${seller.email} (${dealership.name})`);

    // Partner user
    const partnerPassword = await hashPassword('partner123');
    const partner = await prisma.user.upsert({
        where: { email: 'parceiro@faciliauto.com' },
        update: { passwordHash: partnerPassword },
        create: {
            email: 'parceiro@faciliauto.com',
            passwordHash: partnerPassword,
            name: 'Maria Parceira',
            role: 'partner',
            isActive: true,
        },
    });
    console.log(`   ✅ Partner: ${partner.email}`);

    // 3. Update existing vehicles with dealershipId
    console.log('\n🚗 Updating vehicles with dealershipId...');
    const vehicleUpdate = await prisma.vehicle.updateMany({
        where: { dealershipId: null },
        data: { dealershipId: dealership.id },
    });
    console.log(`   ✅ Updated ${vehicleUpdate.count} vehicles`);

    // 4. Update existing leads with dealershipId
    console.log('\n📋 Updating leads with dealershipId...');
    const leadUpdate = await prisma.lead.updateMany({
        where: { dealershipId: null },
        data: { dealershipId: dealership.id },
    });
    console.log(`   ✅ Updated ${leadUpdate.count} leads`);

    // 5. Update existing conversations with dealershipId
    console.log('\n💬 Updating conversations with dealershipId...');
    const conversationUpdate = await prisma.conversation.updateMany({
        where: { dealershipId: null },
        data: { dealershipId: dealership.id },
    });
    console.log(`   ✅ Updated ${conversationUpdate.count} conversations`);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ Dashboard seed completed!\n');
    console.log('📝 Login credentials:');
    console.log('   Admin:   admin@faciliauto.com / admin123');
    console.log('   Seller:  vendedor@renatinhuscars.com / seller123');
    console.log('   Partner: parceiro@faciliauto.com / partner123');
    console.log('\n🌐 Access dashboard at: /leads');
    console.log('='.repeat(50));
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
