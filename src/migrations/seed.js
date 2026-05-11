require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool, withTransaction } = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

async function seed() {
  try {
    await withTransaction(async (client) => {
      logger.info('Iniciando seed...');

      // 1. Barbearia demo
      const { rows: [barbearia] } = await client.query(`
        INSERT INTO barbearias (nome, slug, email, telefone, cidade, estado, timezone)
        VALUES ('Barbearia Estilo', 'barbearia-estilo', 'contato@barbearia-estilo.com',
                '(92) 99999-0000', 'Manaus', 'AM', 'America/Manaus')
        ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome
        RETURNING *
      `);
      logger.info(`Barbearia: ${barbearia.nome} (${barbearia.id})`);

      // 2. Assinatura trial
      await client.query(`
        INSERT INTO assinaturas (barbearia_id, plano, status, data_inicio, data_vencimento)
        VALUES ($1, 'trial', 'trial', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days')
        ON CONFLICT (barbearia_id) DO NOTHING
      `, [barbearia.id]);

      // 3. Usuário owner
      const senhaHash = await bcrypt.hash('123456', 12);
      const { rows: [owner] } = await client.query(`
        INSERT INTO usuarios (barbearia_id, nome, email, senha_hash, role, email_verificado)
        VALUES ($1, 'Carlos Dono', 'owner@barbearia-estilo.com', $2, 'owner', true)
        ON CONFLICT (email, barbearia_id) DO UPDATE SET nome = EXCLUDED.nome
        RETURNING *
      `, [barbearia.id, senhaHash]);
      logger.info(`Owner: ${owner.email}`);

      // 4. Barbeiros
      const { rows: [b1] } = await client.query(`
        INSERT INTO barbeiros (barbearia_id, nome, comissao_pct)
        VALUES ($1, 'Carlos', 40)
        ON CONFLICT DO NOTHING RETURNING *
      `, [barbearia.id]);
      const { rows: [b2] } = await client.query(`
        INSERT INTO barbeiros (barbearia_id, nome, comissao_pct)
        VALUES ($1, 'Rafael', 40)
        ON CONFLICT DO NOTHING RETURNING *
      `, [barbearia.id]);
      const { rows: [b3] } = await client.query(`
        INSERT INTO barbeiros (barbearia_id, nome, comissao_pct)
        VALUES ($1, 'Diego', 40)
        ON CONFLICT DO NOTHING RETURNING *
      `, [barbearia.id]);

      // 5. Serviços
      const servicos = [
        { nome: 'Corte', preco: 35, duracao: 30, categoria: 'Cabelo' },
        { nome: 'Barba', preco: 25, duracao: 20, categoria: 'Barba' },
        { nome: 'Corte + Barba', preco: 55, duracao: 50, categoria: 'Combo' },
        { nome: 'Hidratação', preco: 40, duracao: 40, categoria: 'Tratamento' },
        { nome: 'Coloração', preco: 80, duracao: 60, categoria: 'Coloração' },
        { nome: 'Sobrancelha', preco: 15, duracao: 15, categoria: 'Estética' },
      ];
      const svcRows = [];
      for (const s of servicos) {
        const { rows: [svc] } = await client.query(`
          INSERT INTO servicos (barbearia_id, nome, preco, duracao_min, categoria)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING RETURNING *
        `, [barbearia.id, s.nome, s.preco, s.duracao, s.categoria]);
        if (svc) svcRows.push(svc);
      }

      // 6. Clientes demo
      const clientes = [
        { nome: 'João Silva', telefone: '(92) 99111-2233', whatsapp: '(92) 99111-2233' },
        { nome: 'Pedro Alves', telefone: '(92) 98722-3344', whatsapp: '(92) 98722-3344' },
        { nome: 'Marcos Lima', telefone: '(92) 99344-5566', whatsapp: '(92) 99344-5566' },
      ];
      const cliRows = [];
      for (const c of clientes) {
        const { rows: [cli] } = await client.query(`
          INSERT INTO clientes (barbearia_id, nome, telefone, whatsapp)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING RETURNING *
        `, [barbearia.id, c.nome, c.telefone, c.whatsapp]);
        if (cli) cliRows.push(cli);
      }

      // 7. Estoque demo
      const produtos = [
        { nome: 'Pomada Modeladora', categoria: 'Pomadas', qtd: 8, min: 3, custo: 22 },
        { nome: 'Shampoo Profissional', categoria: 'Shampoos', qtd: 2, min: 5, custo: 35 },
        { nome: 'Lâminas Descartáveis', categoria: 'Lâminas', qtd: 50, min: 20, custo: 1.50 },
        { nome: 'Condicionador', categoria: 'Condicionadores', qtd: 1, min: 3, custo: 28 },
        { nome: 'Óleo para Barba', categoria: 'Outros', qtd: 4, min: 2, custo: 45 },
      ];
      for (const p of produtos) {
        await client.query(`
          INSERT INTO estoque (barbearia_id, nome, categoria, quantidade, quantidade_min, custo_unitario)
          VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING
        `, [barbearia.id, p.nome, p.categoria, p.qtd, p.min, p.custo]);
      }

      // 8. Agendamentos + financeiro demo
      if (cliRows.length > 0 && svcRows.length > 0 && b1) {
        const hoje = new Date().toISOString().slice(0, 10);
        const svcCorte = svcRows.find(s => s.nome === 'Corte') || svcRows[0];
        const svcBarba = svcRows.find(s => s.nome === 'Barba') || svcRows[1] || svcRows[0];

        if (cliRows[0] && b1) {
          const { rows: [ag1] } = await client.query(`
            INSERT INTO agendamentos
              (barbearia_id, cliente_id, barbeiro_id, servico_id, data, hora_inicio, hora_fim,
               status, valor, valor_final)
            VALUES ($1,$2,$3,$4,$5,'09:00','09:30','agendado',$6,$6)
            ON CONFLICT DO NOTHING RETURNING *
          `, [barbearia.id, cliRows[0].id, b1.id, svcCorte.id, hoje, svcCorte.preco]);
          if (ag1) {
            await client.query(`
              INSERT INTO financeiro (barbearia_id, agendamento_id, tipo, categoria, descricao, valor, data)
              VALUES ($1,$2,'receita','Serviço',$3,$4,$5) ON CONFLICT DO NOTHING
            `, [barbearia.id, ag1.id, `${svcCorte.nome} — ${cliRows[0].nome}`, svcCorte.preco, hoje]);
          }
        }

        await client.query(`
          INSERT INTO financeiro (barbearia_id, tipo, categoria, descricao, valor, data)
          VALUES ($1,'despesa','Fixo','Aluguel do mês',1200,$2),
                 ($1,'despesa','Compras','Reposição de estoque',380,$2)
          ON CONFLICT DO NOTHING
        `, [barbearia.id, hoje]);
      }

      logger.info('Seed concluído com sucesso!');
      logger.info('Login: owner@barbearia-estilo.com | Senha: 123456');
    });
  } catch (err) {
    logger.error('Erro no seed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
