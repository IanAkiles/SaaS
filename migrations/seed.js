require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../src/config/database');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('[SEED] Iniciando seed de demonstração...');

    const barbId = uuidv4();
    await client.query(`
      INSERT INTO barbearias (id,nome,slug,email,telefone,cidade,estado)
      VALUES ($1,'Barbearia do Zé','barbearia-do-ze','ze@barberpro.com','(92)99999-0000','Manaus','AM')
      ON CONFLICT (slug) DO NOTHING
    `, [barbId]);

    await client.query(`
      INSERT INTO assinaturas (barbearia_id,plano,status,data_vencimento)
      VALUES ($1,'pro','trial', NOW() + INTERVAL '7 days')
    `, [barbId]);

    const senhaHash = await bcrypt.hash('123456', 12);
    const userId = uuidv4();
    await client.query(`
      INSERT INTO usuarios (id,barbearia_id,nome,email,senha_hash,role)
      VALUES ($1,$2,'Zé Dono','ze@barberpro.com',$3,'dono')
      ON CONFLICT (email) DO NOTHING
    `, [userId, barbId, senhaHash]);

    const [b1,b2,b3] = [uuidv4(),uuidv4(),uuidv4()];
    for (const [id,nome,tel] of [[b1,'Carlos','(92)99111-1111'],[b2,'Rafael','(92)99222-2222'],[b3,'Diego','(92)99333-3333']]) {
      await client.query(`INSERT INTO barbeiros (id,barbearia_id,nome,telefone) VALUES ($1,$2,$3,$4)`, [id,barbId,nome,tel]);
    }

    const [s1,s2,s3,s4,s5,s6] = Array.from({length:6},()=>uuidv4());
    const svcs = [[s1,'Corte',35,30,'✂'],[s2,'Barba',25,20,'🪒'],[s3,'Corte + Barba',55,50,'💈'],[s4,'Hidratação',40,40,'💧'],[s5,'Coloração',80,90,'🎨'],[s6,'Sobrancelha',15,15,'👁']];
    for (const [id,nome,preco,dur,ico] of svcs) {
      await client.query(`INSERT INTO servicos (id,barbearia_id,nome,preco,duracao_min,icone) VALUES ($1,$2,$3,$4,$5,$6)`, [id,barbId,nome,preco,dur,ico]);
    }

    const [c1,c2,c3] = [uuidv4(),uuidv4(),uuidv4()];
    for (const [id,nome,tel,vis] of [[c1,'João Silva','(92)99111-2233',5],[c2,'Pedro Alves','(92)98722-3344',3],[c3,'Marcos Lima','(92)99344-5566',8]]) {
      await client.query(`INSERT INTO clientes (id,barbearia_id,nome,telefone,whatsapp,total_visitas) VALUES ($1,$2,$3,$4,$4,$5)`, [id,barbId,nome,tel,vis]);
    }

    const estoqueItens = [['Pomada Modeladora','Pomadas',8,3,22],['Shampoo Profissional','Shampoos',2,5,35],['Lâminas Descartáveis','Lâminas',50,20,1.5],['Condicionador','Condicionadores',1,3,28],['Óleo para Barba','Outros',4,2,45]];
    for (const [nome,cat,qtd,min,custo] of estoqueItens) {
      await client.query(`INSERT INTO estoque (barbearia_id,nome,categoria,quantidade,quantidade_min,custo_unitario) VALUES ($1,$2,$3,$4,$5,$6)`, [barbId,nome,cat,qtd,min,custo]);
    }

    const hoje = new Date();
    const [ag1,ag2,ag3] = [uuidv4(),uuidv4(),uuidv4()];
    const h09 = new Date(hoje); h09.setHours(9,0,0,0);
    const h1030 = new Date(hoje); h1030.setHours(10,30,0,0);
    const h14 = new Date(hoje); h14.setHours(14,0,0,0);

    await client.query(`INSERT INTO agendamentos (id,barbearia_id,cliente_id,barbeiro_id,servico_id,data_hora,duracao_min,valor,status) VALUES ($1,$2,$3,$4,$5,$6,30,35.00,'agendado')`, [ag1,barbId,c1,b1,s1,h09]);
    await client.query(`INSERT INTO agendamentos (id,barbearia_id,cliente_id,barbeiro_id,servico_id,data_hora,duracao_min,valor,status) VALUES ($1,$2,$3,$4,$5,$6,50,55.00,'agendado')`, [ag2,barbId,c2,b2,s3,h1030]);
    await client.query(`INSERT INTO agendamentos (id,barbearia_id,cliente_id,barbeiro_id,servico_id,data_hora,duracao_min,valor,status) VALUES ($1,$2,$3,$4,$5,$6,20,25.00,'concluido')`, [ag3,barbId,c3,b3,s2,h14]);

    await client.query(`INSERT INTO financeiro (barbearia_id,agendamento_id,tipo,descricao,valor,categoria) VALUES ($1,$2,'receita','Corte — João Silva',35,'Serviços')`, [barbId,ag1]);
    await client.query(`INSERT INTO financeiro (barbearia_id,agendamento_id,tipo,descricao,valor,categoria) VALUES ($1,$2,'receita','Corte + Barba — Pedro',55,'Serviços')`, [barbId,ag2]);
    await client.query(`INSERT INTO financeiro (barbearia_id,agendamento_id,tipo,descricao,valor,categoria) VALUES ($1,$2,'receita','Barba — Marcos Lima',25,'Serviços')`, [barbId,ag3]);
    await client.query(`INSERT INTO financeiro (barbearia_id,tipo,descricao,valor,categoria) VALUES ($1,'despesa','Aluguel do mês',1200,'Fixo')`, [barbId]);
    await client.query(`INSERT INTO financeiro (barbearia_id,tipo,descricao,valor,categoria) VALUES ($1,'despesa','Reposição de estoque',380,'Estoque')`, [barbId]);

    await client.query('COMMIT');
    console.log('[SEED] ✅ Dados inseridos com sucesso!');
    console.log('[SEED] 📧 Login: ze@barberpro.com');
    console.log('[SEED] 🔑 Senha: 123456');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[SEED] ❌ Erro:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
